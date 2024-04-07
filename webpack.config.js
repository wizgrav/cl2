'use strict';

const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
    mode: 'production',
    entry: {
        'main': './src/index.js'
    },
    devtool: 'source-map',
    target: 'web',
   
    plugins: [
        new CopyPlugin({
            patterns: [
                "index.html",
                "favicon.png",
                "suzanne.json",
                "promo.jpg",
                "lights.wasm",
                "model.wasm"
            ],
            options: {
              concurrency: 100,
            },
          })
       
        
    ],
    output: {
        path: __dirname + '/docs',
        filename: '[name].js'
    },
    performance: {
        maxAssetSize: 20000000,
        maxEntrypointSize: 40000000,
      }
     
    
    
};