const { FilesetResolver, ImageSegmenter } = require('@mediapipe/tasks-vision');
async function run() {
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
  const segmenter = await ImageSegmenter.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-assets/selfie_segmentation.tflite",
      delegate: "CPU"
    },
    runningMode: "IMAGE",
    outputCategoryMask: true,
    outputConfidenceMasks: false
  });
  console.log("Segmenter loaded!", segmenter);
}
run().catch(console.error);
