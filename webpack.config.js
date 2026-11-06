const CopyWebpackPlugin = require("copy-webpack-plugin");
const path = require("path");
const MinimizerPlugin = require("minimizer-webpack-plugin");

// Text recognition runs offline: the tesseract.js worker, its WebAssembly core (SIMD build,
// supported by every Chromium version with Manifest V3) and the English and Portuguese
// language data are copied into the extension.
// Source map references are removed; the maps are not shipped.
const stripSourceMap = { info: { minimized: true }, transform: (content) => content.toString().replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, "\n") };
const OCR_ASSETS = [
    { from: "node_modules/tesseract.js/dist/worker.min.js", to: "ocr/worker.min.js", ...stripSourceMap },
    { from: "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", to: "ocr/tesseract-core-simd-lstm.wasm.js", ...stripSourceMap },
    { from: "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", to: "ocr/lang/eng.traineddata.gz", info: { minimized: true } },
    { from: "node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz", to: "ocr/lang/por.traineddata.gz", info: { minimized: true } }
];

module.exports = {
    mode: "production",
    entry: {
        background: "./src/background/background.ts",
        content: "./src/content/content.ts",
        popup: "./src/popup/popup.ts",
        options: "./src/pages/options.ts",
        batch: "./src/pages/batch.ts",
        ocr: "./src/pages/ocr.ts",
        compare: "./src/pages/compare.ts"
    },
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "[name].js",
        clean: true
    },
    resolve: {
        extensions: [".ts", ".js"]
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: "esbuild-loader",
                options: { target: "es2022" },
                exclude: /node_modules/
            }
        ]
    },
    optimization: {
        // Keep license notices of bundled libraries inside the bundles instead of separate files.
        minimizer: [new MinimizerPlugin({
            minify: MinimizerPlugin.terserMinify,
            extractComments: false,
            minimizerOptions: { compress: { passes: 2 }, format: { comments: /@license|@preserve|^!/i, ascii_only: true } }
        })]
    },
    performance: {
        // pdf-lib and tesseract.js make the background and batch bundles large on purpose.
        hints: false
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                { from: "src/manifest.json", to: "manifest.json" },
                { from: "src/icons/*.png", to: "icons/[name][ext]" },
                { from: "src/popup/popup.html", to: "popup.html" },
                { from: "src/pages/*.html", to: "[name][ext]" },
                { from: "src/pages/pages.css", to: "pages.css" },
                ...OCR_ASSETS
            ]
        })
    ],
    devtool: false
};
