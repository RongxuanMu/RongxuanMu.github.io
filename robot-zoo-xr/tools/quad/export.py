"""TorchScript policy -> ONNX (legacy exporter), then compare on random inputs."""
import sys, torch, numpy as np, onnxruntime as ort
src, dst, n_in = sys.argv[1], sys.argv[2], int(sys.argv[3])
m = torch.jit.load(src, map_location='cpu').eval()
x = torch.zeros(1, n_in)
torch.onnx.export(m, (x,), dst, input_names=['obs'], output_names=['actions'], opset_version=17, dynamo=False)
s = ort.InferenceSession(dst)
rng = np.random.default_rng(0)
err = 0
for _ in range(200):
    xi = rng.normal(size=(1, n_in)).astype(np.float32)
    with torch.no_grad():
        ref = m(torch.from_numpy(xi)).numpy()
    err = max(err, float(np.abs(s.run(None, {'obs': xi})[0] - ref).max()))
print(dst, 'in', n_in, 'out', ref.shape, 'max err', err)
