"use client";

import { useState } from "react";

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
      src="/imagotipo.png"
      alt="Alimin"
      className={className}
      onError={() => setFalloLaImagen(true)}
    />
  );
}
