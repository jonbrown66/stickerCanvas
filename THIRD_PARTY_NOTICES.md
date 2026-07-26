# Third-Party Notices

## Local Background Removal

Browser-side inference uses `onnxruntime-web`, licensed under the MIT License.
The background-removal weights are redistributed with this project and loaded
on demand from the application's own origin. They are a quantized ONNX build of
the IS-Net general-use model from the DIS project and are licensed under the
Apache License 2.0. The bundled copy, source revision, and checksum are recorded
under `public/models/isnet-general-use-onnx/`.

## HEIC Image Import

Browser-side HEIC/HEIF conversion uses `heic-decode`, licensed under the ISC
License, and its `libheif-js` dependency, licensed under the GNU Lesser General
Public License v3.0. The decoder is loaded on demand only when one of those
formats is selected.
