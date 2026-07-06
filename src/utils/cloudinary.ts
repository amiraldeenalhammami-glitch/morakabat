const compressAndConvertToBase64 = (file: File, maxWidth = 400, maxHeight = 400, quality = 0.4): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      try {
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Resize logic while preserving aspect ratio
            if (width > height) {
              if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              }
            } else {
              if (height > maxHeight) {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(dataUrl); // fallback to original base64
              return;
            }

            ctx.drawImage(img, 0, 0, width, height);
            // Get compressed JPEG data URL
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedDataUrl);
          } catch (canvasErr) {
            console.warn('Canvas compression error, falling back to original base64', canvasErr);
            resolve(dataUrl);
          }
        };
        img.onerror = () => {
          resolve(dataUrl); // fallback to original base64
        };
      } catch (imgErr) {
        console.warn('Image loading error, falling back to original base64', imgErr);
        resolve(dataUrl);
      }
    };
    reader.onerror = () => {
      resolve(''); // fallback to empty
    };
  });
};

export const uploadToCloudinary = async (file: File): Promise<string> => {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  // If Cloudinary configuration is missing, use Base64 fallback immediately
  if (!cloudName || !uploadPreset) {
    console.warn('Cloudinary config is missing. Falling back to compressed Base64 representation.');
    return compressAndConvertToBase64(file);
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      console.warn('Cloudinary response not OK, falling back to Base64.');
      return compressAndConvertToBase64(file);
    }

    const data = await response.json();
    return data.secure_url;
  } catch (error: any) {
    console.warn('Cloudinary upload failed, falling back to Base64.', error);
    return compressAndConvertToBase64(file);
  }
};

