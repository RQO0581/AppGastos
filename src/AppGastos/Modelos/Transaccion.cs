namespace AppGastos.Modelos;

public class Transaccion
{
    public Guid Id { get; set; }
    public TipoTransaccion Tipo { get; set; }
    public DateOnly Fecha { get; set; }
    public decimal Monto { get; set; }

    // Solo en gastos: un ingreso no tiene método de pago.
    public MetodoPago? MetodoPago { get; set; }

    // Se guarda el nombre, no una referencia: reimportar el catálogo no altera las transacciones.
    // Gasto: banco, tarjeta o Efectivo. Ingreso: cuenta de ingreso.
    public string CuentaOrigen { get; set; } = "";

    // Gasto: cuenta de gasto. Ingreso: banco o Efectivo.
    public string CuentaDestino { get; set; } = "";
}
