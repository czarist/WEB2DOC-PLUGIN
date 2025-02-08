const CopyWebpackPlugin = require("copy-webpack-plugin");
const path = require("path");

module.exports = {
    entry: {
        background: "./src/background.ts",
        content: "./src/content.ts",
        popup: "./src/popup.ts"
    },
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "[name].js"
    },
    resolve: {
        extensions: [".ts", ".js"]
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: "ts-loader",
                exclude: /node_modules/
            }
        ]
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                { from: "src/manifest.json", to: "manifest.json" },
                { from: "src/icon.png", to: "icon.png" },
                { from: "src/popup.html", to: "popup.html" }
            ]
        })
    ],
    devtool: "inline-source-map"
};
