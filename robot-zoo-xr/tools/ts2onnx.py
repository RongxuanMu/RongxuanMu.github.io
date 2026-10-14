"""Convert the small TorchScript locomotion policies (unitree_rl_gym LSTM exporters, booster_gym MLPs) to ONNX
without PyTorch: unpickle data.pkl with stub classes to recover named tensors, rebuild the network with
onnx.helper, and check it against a NumPy forward pass written from the TorchScript code.
  python ts2onnx.py in.pt out.onnx"""
import io
import pickle
import sys
import zipfile

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

DT = {'FloatStorage': np.float32, 'DoubleStorage': np.float64, 'LongStorage': np.int64, 'IntStorage': np.int32, 'BoolStorage': np.bool_}


class Obj:
    def __init__(self, *a, **k):
        self.__dict__['_a'] = a

    def __setstate__(self, st):
        if isinstance(st, dict):
            self.__dict__.update(st)
        else:
            self.__dict__['_state'] = st


def load(path):
    z = zipfile.ZipFile(path)
    root = z.namelist()[0].split('/')[0]

    class U(pickle.Unpickler):
        def find_class(self, mod, name):
            if mod == 'torch._utils' and name == '_rebuild_tensor_v2':
                def rebuild(storage, offset, size, stride, *rest):
                    arr = storage
                    # contiguous tensors only (all of these are)
                    return np.lib.stride_tricks.as_strided(arr[offset:], shape=size, strides=[s * arr.itemsize for s in stride]).copy()
                return rebuild
            if mod == 'torch' and name.endswith('Storage'):
                return name
            if mod == 'collections' and name == 'OrderedDict':
                import collections
                return collections.OrderedDict
            if mod == 'torch.jit._pickle':
                return lambda *a: a[0] if a else None
            return type(name, (Obj,), {})

        def persistent_load(self, pid):
            _, typ, key, loc, numel = pid
            raw = z.read(f'{root}/data/{key}')
            return np.frombuffer(raw, dtype=DT[typ if isinstance(typ, str) else typ.__name__]).copy()

    obj = U(io.BytesIO(z.read(f'{root}/data.pkl'))).load()
    tensors = {}

    def walk(o, prefix):
        if isinstance(o, np.ndarray):
            tensors[prefix] = o
        elif isinstance(o, Obj):
            for k, v in o.__dict__.items():
                if not k.startswith('_'):
                    walk(v, f'{prefix}.{k}' if prefix else k)
    walk(obj, '')
    return tensors


def mlp_layers(t, prefix):
    key = lambda i, n: f'{prefix}.{i}.{n}' if prefix else f'{i}.{n}'
    i, out = 0, []
    while key(i, 'weight') in t or key(i + 1, 'weight') in t:
        if key(i, 'weight') in t:
            out.append((t[key(i, 'weight')], t[key(i, 'bias')]))
        i += 1
    return out


def numpy_forward(t, x, h=None, c=None):
    elu = lambda v: np.where(v > 0, v, np.exp(np.minimum(v, 0)) - 1)
    if 'memory.weight_ih_l0' in t:
        Wi, Wh, bi, bh = (t[f'memory.{k}_l0'] for k in ('weight_ih', 'weight_hh', 'bias_ih', 'bias_hh'))
        H = Wh.shape[1]
        h = np.zeros(H, np.float32) if h is None else h
        c = np.zeros(H, np.float32) if c is None else c
        g = Wi @ x + bi + Wh @ h + bh
        sig = lambda v: 1 / (1 + np.exp(-v))
        i_, f_, g_, o_ = sig(g[:H]), sig(g[H:2 * H]), np.tanh(g[2 * H:3 * H]), sig(g[3 * H:])
        c = f_ * c + i_ * g_
        h = o_ * np.tanh(c)
        y, layers = h, mlp_layers(t, 'actor')
    else:
        y, layers = x, mlp_layers(t, 'actor' if any(k.startswith('actor.') for k in t) else '')
    for k, (W, b) in enumerate(layers):
        y = W @ y + b
        if k < len(layers) - 1:
            y = elu(y)
    return y, h, c


def build_onnx(t, out):
    nodes, inits = [], []
    lstm = 'memory.weight_ih_l0' in t
    prefix = 'actor' if any(k.startswith('actor.') for k in t) else ''
    layers = mlp_layers(t, prefix)
    n_in = t['memory.weight_ih_l0'].shape[1] if lstm else layers[0][0].shape[1]
    inputs = [helper.make_tensor_value_info('obs', TensorProto.FLOAT, [1, n_in])]
    outputs = []
    cur = 'obs'
    if lstm:
        Wi, Wh, bi, bh = (t[f'memory.{k}_l0'] for k in ('weight_ih', 'weight_hh', 'bias_ih', 'bias_hh'))
        H = Wh.shape[1]
        # PyTorch gate order i, f, g, o -> ONNX i, o, f, c
        perm = lambda m: np.concatenate([m[0:H], m[3 * H:4 * H], m[H:2 * H], m[2 * H:3 * H]])
        inits += [numpy_helper.from_array(perm(Wi)[None].astype(np.float32), 'W'), numpy_helper.from_array(perm(Wh)[None].astype(np.float32), 'R'),
                  numpy_helper.from_array(np.concatenate([perm(bi), perm(bh)])[None].astype(np.float32), 'B'),
                  numpy_helper.from_array(np.array([1, 1, n_in], np.int64), 'seqshape')]
        inputs += [helper.make_tensor_value_info('h_in', TensorProto.FLOAT, [1, 1, H]), helper.make_tensor_value_info('c_in', TensorProto.FLOAT, [1, 1, H])]
        nodes += [helper.make_node('Reshape', ['obs', 'seqshape'], ['seq']),
                  helper.make_node('LSTM', ['seq', 'W', 'R', 'B', '', 'h_in', 'c_in'], ['Y', 'h_out', 'c_out'], hidden_size=H),
                  helper.make_node('Squeeze', ['Y', 'sq'], ['lstm_y'])]
        inits.append(numpy_helper.from_array(np.array([0, 1], np.int64), 'sq'))
        outputs += [helper.make_tensor_value_info('h_out', TensorProto.FLOAT, [1, 1, H]), helper.make_tensor_value_info('c_out', TensorProto.FLOAT, [1, 1, H])]
        cur = 'lstm_y'
    for k, (W, b) in enumerate(layers):
        inits += [numpy_helper.from_array(W.T.astype(np.float32).copy(), f'W{k}'), numpy_helper.from_array(b.astype(np.float32), f'b{k}')]
        nodes += [helper.make_node('Gemm', [cur, f'W{k}', f'b{k}'], [f'y{k}'])]
        cur = f'y{k}'
        if k < len(layers) - 1:
            nodes.append(helper.make_node('Elu', [cur], [f'e{k}'], alpha=1.0))
            cur = f'e{k}'
    nodes.append(helper.make_node('Identity', [cur], ['actions']))
    outputs.insert(0, helper.make_tensor_value_info('actions', TensorProto.FLOAT, [1, layers[-1][0].shape[0]]))
    model = helper.make_model(helper.make_graph(nodes, 'policy', inputs, outputs, inits), opset_imports=[helper.make_opsetid('', 17)])
    model.ir_version = 8
    onnx.checker.check_model(model)
    onnx.save(model, out)
    return n_in, lstm


if __name__ == '__main__':
    src, dst = sys.argv[1:3]
    t = load(src)
    print({k: v.shape for k, v in t.items()})
    n_in, lstm = build_onnx(t, dst)
    import onnxruntime as ort
    s = ort.InferenceSession(dst)
    rng = np.random.default_rng(0)
    h = c = None
    H = t['memory.weight_hh_l0'].shape[1] if lstm else 0
    hh = np.zeros((1, 1, H), np.float32)
    cc = np.zeros((1, 1, H), np.float32)
    err = 0
    for step in range(20):
        x = rng.normal(size=n_in).astype(np.float32)
        ref, h, c = numpy_forward(t, x, h, c)
        feed = {'obs': x[None]}
        if lstm:
            feed.update(h_in=hh, c_in=cc)
        res = s.run(None, feed)
        if lstm:
            hh, cc = res[1], res[2]
        err = max(err, float(np.abs(res[0][0] - ref).max()))
    print(f'{dst}: inputs {n_in}, lstm {lstm}, max |onnx - numpy| over 20 steps = {err:.2e}')
