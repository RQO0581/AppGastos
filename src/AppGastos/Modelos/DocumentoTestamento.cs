namespace AppGastos.Modelos;

// El testamento tal como viene en el Excel: las filas en su orden, incluidas las vacías.
public class DocumentoTestamento
{
    public DateOnly FechaImportacion { get; set; }
    public List<FilaTestamento> Filas { get; set; } = [];
}

public class FilaTestamento
{
    public string Descripcion { get; set; } = "";
    public bool DescripcionEnNegrita { get; set; }

    // Una fila tiene un monto, un texto en la columna B, o ninguno de los dos.
    public decimal? Cantidad { get; set; }
    public string? TextoCantidad { get; set; }
    public bool CantidadEnNegrita { get; set; }
}
