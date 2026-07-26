# IS-Net general-use model provenance

This directory redistributes a quantized ONNX build of the IS-Net general-use
background-removal model under the Apache License 2.0.

- Model package: https://huggingface.co/Ko033/isnet-general-use-onnx
- Model revision: `5349b61`
- Original DIS project: https://github.com/xuebinqin/DIS
- Bundled file: `onnx/model_quantized.onnx`
- File size: `45,902,969` bytes
- SHA-256: `5039225b9a4ac3df55f185d24b7a92d640c86cc4747002d7f23351e394de03a6`
- Input used by this application: float32 RGB tensor at `320 × 320`,
  normalized as `pixel / 255 - 0.5`

The model is loaded only when a user imports or captures a photo.
