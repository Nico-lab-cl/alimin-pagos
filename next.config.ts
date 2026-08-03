import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  /**
   * Proteccion contra "version skew" (cliente con una version vieja de la pagina).
   *
   * Al desplegar, Next le cambia el identificador interno a cada accion de
   * servidor. El cliente que ya tenia la pagina abierta sigue con los
   * identificadores viejos, asi que al apretar "subir comprobante" el servidor
   * responde "Failed to find Server Action" y el archivo no llega nunca. El
   * cliente no ve ningun aviso: para el, el boton simplemente no hizo nada.
   * Nos paso con tres clientes que juraban haber subido su comprobante.
   *
   * Con un deploymentId configurado, Next detecta el desfase por cabecera y
   * recarga la pagina entera en vez de fallar en silencio, y el envio funciona.
   *
   * Requiere NEXT_DEPLOYMENT_ID en el ambiente AL COMPILAR, con un valor
   * distinto en cada despliegue (el hash del commit sirve). Si la variable no
   * esta, la proteccion queda apagada y todo se comporta como antes.
   *
   * Verificado en esta version: el valor queda grabado en la compilacion y el
   * de tiempo de arranque se ignora. Se compilo con "prueba-abc123", se
   * levanto el standalone con "OTRO-VALOR-999" y el HTML servido seguia
   * trayendo "prueba-abc123" tanto en data-dpl-id como en los ?dpl= de los
   * archivos. Asi que no hay forma de que el servidor y la pagina queden con
   * identificadores distintos y dejen al cliente recargando en bucle.
   */
  deploymentId: process.env.NEXT_DEPLOYMENT_ID,

  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
