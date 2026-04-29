export const readBlobAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Falha ao ler foto.'));
    };
    reader.onerror = () => reject(new Error('Falha ao ler foto.'));
    reader.readAsDataURL(file);
  });

export const formatCoordinateLabel = (lat: number | null, lng: number | null) => {
  if (lat === null || lng === null) {
    return 'Localização indisponível';
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
};
