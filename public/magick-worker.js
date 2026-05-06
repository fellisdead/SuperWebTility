// Web Worker for ImageMagick processing (ESM Version)
// Using local files to ensure reliability and bypass CDN issues

let magickReady = false;
let ImageMagick = null;
let MagickFormat = null;
let magickModule = null;

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === 'init') {
    try {
      console.log('Worker: Starting local initialization...');
      
      // Use local file copied from node_modules
      const localModuleUrl = '/magick-wasm.js';
      magickModule = await import(localModuleUrl);
      
      ImageMagick = magickModule.ImageMagick;
      MagickFormat = magickModule.MagickFormat;
      
      // Use local wasm file
      const wasmUrl = '/magick.wasm';
      const wasmResponse = await fetch(wasmUrl);
      const wasmBytes = await wasmResponse.arrayBuffer();
      
      await magickModule.initializeImageMagick(new Uint8Array(wasmBytes));
      
      magickReady = true;
      console.log('Worker: Magick Ready (Local ESM)');
      self.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('Worker: Init Error', err);
      self.postMessage({ type: 'error', error: err.message });
    }
  }

  if (type === 'convert') {
    if (!magickReady) {
      self.postMessage({ type: 'error', error: 'Magick not ready' });
      return;
    }

    const { id, buffer, format, quality } = data;
    
    try {
      const formatMap = {
        'JPEG': MagickFormat.Jpeg,
        'PNG': MagickFormat.Png,
        'WEBP': MagickFormat.WebP,
        'GIF': MagickFormat.Gif,
        'BMP': MagickFormat.Bmp,
        'TIFF': MagickFormat.Tiff,
        'ICO': MagickFormat.Ico,
        'AVIF': MagickFormat.Avif,
        'TGA': MagickFormat.Tga
      };

      const targetFormat = formatMap[format] || MagickFormat.Jpeg;

      ImageMagick.read(new Uint8Array(buffer), (image) => {
        try {
          if (!['PNG', 'GIF', 'BMP', 'ICO', 'TGA'].includes(format)) {
            image.quality = Math.round(quality * 100);
          }

          image.write(targetFormat, (convertedData) => {
            const resultBuffer = new Uint8Array(convertedData);
            self.postMessage({ 
              type: 'done', 
              id, 
              data: resultBuffer 
            }, [resultBuffer.buffer]);
          });
        } catch (innerErr) {
          self.postMessage({ type: 'error', id, error: innerErr.message });
        }
      });
    } catch (err) {
      self.postMessage({ type: 'error', id, error: err.message });
    }
  }
};
