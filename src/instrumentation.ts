// Corre una vez al arrancar el servidor (convencion de Next.js).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { iniciarProgramadorResumen } = await import("./lib/programadorResumen");
    iniciarProgramadorResumen();
  }
}
