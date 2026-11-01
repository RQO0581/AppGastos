namespace AppGastos.Modelos;

public class Transaccion
{
    public Guid Id { get; set; }
    public DateOnly Fecha { get; set; }
    public decimal Monto { get; set; }
    public MetodoPago MetodoPago { get; set; }

    // Se guarda el nombre, no una referencia: reimportar el catálogo no altera las transacciones.
    public string CuentaOrigen { get; set; } = "";
    public string CuentaGasto { get; set; } = "";
}
