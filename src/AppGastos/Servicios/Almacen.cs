using AppGastos.Modelos;
using Microsoft.JSInterop;

namespace AppGastos.Servicios;

public class Almacen(IJSRuntime js)
{
    private const string ClaveCorreo = "correo";

    public ValueTask GuardarTransaccionAsync(Transaccion transaccion) =>
        js.InvokeVoidAsync("appGastos.almacen.guardarTransaccion", transaccion);

    public ValueTask<Transaccion?> ObtenerTransaccionAsync(Guid id) =>
        js.InvokeAsync<Transaccion?>("appGastos.almacen.obtenerTransaccion", id);

    // Sin fechas devuelve todas. Las dos fechas se incluyen en el rango.
    public ValueTask<Transaccion[]> ListarTransaccionesAsync(DateOnly? desde = null, DateOnly? hasta = null) =>
        js.InvokeAsync<Transaccion[]>("appGastos.almacen.listarTransacciones", desde, hasta);

    public ValueTask BorrarTransaccionAsync(Guid id) =>
        js.InvokeVoidAsync("appGastos.almacen.borrarTransaccion", id);

    // Devuelve cuántas transacciones se borraron.
    public ValueTask<int> BorrarTransaccionesPorRangoAsync(DateOnly desde, DateOnly hasta) =>
        js.InvokeAsync<int>("appGastos.almacen.borrarTransaccionesPorRango", desde, hasta);

    // Borra las transacciones de todos los meses. Devuelve cuántas se borraron.
    public ValueTask<int> BorrarTodasLasTransaccionesAsync() =>
        js.InvokeAsync<int>("appGastos.almacen.borrarTodasLasTransacciones");

    public ValueTask<CuentaOrigen[]> ListarCuentasOrigenAsync() =>
        js.InvokeAsync<CuentaOrigen[]>("appGastos.almacen.listarCuentasOrigen");

    public ValueTask<CuentaGasto[]> ListarCuentasGastoAsync() =>
        js.InvokeAsync<CuentaGasto[]>("appGastos.almacen.listarCuentasGasto");

    public ValueTask<CuentaIngreso[]> ListarCuentasIngresoAsync() =>
        js.InvokeAsync<CuentaIngreso[]>("appGastos.almacen.listarCuentasIngreso");

    // Reemplaza los tres almacenes en una sola transacción: o cambian todos, o ninguno.
    public ValueTask ReemplazarCatalogoAsync(
        IEnumerable<CuentaOrigen> cuentasOrigen,
        IEnumerable<CuentaGasto> cuentasGasto,
        IEnumerable<CuentaIngreso> cuentasIngreso) =>
        js.InvokeVoidAsync("appGastos.almacen.reemplazarCatalogo", cuentasOrigen.ToArray(), cuentasGasto.ToArray(), cuentasIngreso.ToArray());

    public ValueTask<string?> ObtenerCorreoAsync() =>
        js.InvokeAsync<string?>("appGastos.almacen.obtenerAjuste", ClaveCorreo);

    public ValueTask GuardarCorreoAsync(string correo) =>
        js.InvokeVoidAsync("appGastos.almacen.guardarAjuste", ClaveCorreo, correo);

    public ValueTask<bool> PedirPersistenciaAsync() =>
        js.InvokeAsync<bool>("appGastos.almacen.pedirPersistencia");
}
