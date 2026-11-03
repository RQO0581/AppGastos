namespace AppGastos.Modelos;

public class Transaccion
{
    public Guid Id { get; set; }
    public TipoTransaccion Tipo { get; set; }
    public DateOnly Fecha { get; set; }
    public decimal Monto { get; set; }

    // Solo en gastos: los otros tipos no tienen método de pago.
    public MetodoPago? MetodoPago { get; set; }

    // Se guarda el nombre, no una referencia: reimportar el catálogo no altera las transacciones.
    // Gasto: banco, tarjeta o Efectivo. Ingreso: cuenta de ingreso. Transferencia: de donde sale el dinero.
    // Devolución: cuenta de gasto del gasto original.
    public string CuentaOrigen { get; set; } = "";

    // Gasto: cuenta de gasto. Ingreso: banco o Efectivo. Transferencia: a donde entra el dinero.
    // Devolución: banco, tarjeta o Efectivo a donde vuelve el dinero.
    public string CuentaDestino { get; set; } = "";
}
