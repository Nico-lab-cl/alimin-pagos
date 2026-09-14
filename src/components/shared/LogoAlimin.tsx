"use client";

import { useEffect, useRef, useState } from "react";

/**
 * El imagotipo de Alimin: la hoja y la palabra en un solo archivo.
 *
 * Antes la palabra se escribía como texto (`<h1>Alimin</h1>`) al lado de la
 * hoja, así que la tipografía de la marca dependía de la fuente que cargara el
 * navegador y no se parecía a la del imagotipo real.
 *
 * Si el archivo no está —todavía no se subió, o no viajó en el despliegue— se
 * vuelve a la hoja más el texto, que es exactamente como se veía antes. Vale
 * más eso que un ícono de imagen rota en la cabecera que ve el cliente.
 */
export default function LogoAlimin({
  className = "h-8 w-auto",
  /** Clases del texto del respaldo, para que calce con cada barra. */
  textClassName = "text-xl font-bold tracking-tight text-brand-600 whitespace-nowrap",
  /** Tamaño de la hoja en el respaldo. */
  markClassName = "w-8 h-8 object-contain",
}: {
  className?: string;
  textClassName?: string;
  markClassName?: string;
}) {
  const [falloLaImagen, setFalloLaImagen] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // No alcanza con `onError`. La página se arma en el servidor, así que el
  // navegador empieza a cargar la imagen apenas recibe el HTML y, si el archivo
  // no está, falla ANTES de que React hidrate y enganche el manejador: el error
  // ya ocurrió y nadie lo escuchó, así que quedaba el ícono de imagen rota que
  // este respaldo venía justamente a evitar.
  //
  // Por eso al montar se revisa el estado real del elemento: una imagen que
  // termino de cargar (`complete`) pero no tiene ancho es una que fallo.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFalloLaImagen(true);
  }, []);

  if (falloLaImagen) {
    return (
      <span className="flex items-center gap-2">
        <img src="/logo.png" alt="" className={markClassName} />
        <span className={textClassName}>Alimin</span>
      </span>
    );
  }

  return (
    <img
      ref={ref}
      src="/imagotipo.png"
      alt="Alimin"
      className={className}
      onError={() => setFalloLaImagen(true)}
    />
  );
}
