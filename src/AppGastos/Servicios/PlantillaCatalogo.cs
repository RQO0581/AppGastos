using AppGastos.Modelos;
using ClosedXML.Excel;

namespace AppGastos.Servicios;

public static class PlantillaCatalogo
{
    public const string NombreArchivo = "Catalogo_plantilla.xlsx";

    private const int UltimaFilaConLista = 500;

    public static byte[] Crear()
    {
        using var libro = new XLWorkbook();

        var origen = libro.AddWorksheet(ImportadorCatalogo.HojaCuentasOrigen);
        origen.Cell(1, 1).Value = ImportadorCatalogo.ColumnaNombre;
        origen.Cell(1, 2).Value = ImportadorCatalogo.ColumnaTipo;
        origen.Cell(2, 1).Value = ImportadorCatalogo.NombreEfectivo;
        origen.Cell(2, 2).Value = ImportadorCatalogo.TextoTipo(TipoCuentaOrigen.Efectivo);
        origen.Cell(3, 1).Value = "Banco-Ejemplo";
        origen.Cell(3, 2).Value = ImportadorCatalogo.TextoTipo(TipoCuentaOrigen.Banco);
        origen.Cell(4, 1).Value = "Tarjeta-Ejemplo";
        origen.Cell(4, 2).Value = ImportadorCatalogo.TextoTipo(TipoCuentaOrigen.TarjetaCredito);
        origen.Column(1).Width = 30;
        origen.Column(2).Width = 22;

        // En Excel, la columna Tipo muestra una lista para no tener que escribir el valor.
        var tipos = string.Join(",", Enum.GetValues<TipoCuentaOrigen>().Select(ImportadorCatalogo.TextoTipo));
        origen.Range(2, 2, UltimaFilaConLista, 2).CreateDataValidation().List($"\"{tipos}\"", true);

        var gasto = libro.AddWorksheet(ImportadorCatalogo.HojaCuentasGasto);
        gasto.Cell(1, 1).Value = ImportadorCatalogo.ColumnaNombre;
        gasto.Cell(2, 1).Value = "Comida";
        gasto.Cell(3, 1).Value = "Telefonos";
        gasto.Column(1).Width = 30;

        var ingreso = libro.AddWorksheet(ImportadorCatalogo.HojaCuentasIngreso);
        ingreso.Cell(1, 1).Value = ImportadorCatalogo.ColumnaNombre;
        ingreso.Cell(2, 1).Value = "Ingreso-Ejemplo";
        ingreso.Column(1).Width = 30;

        using var memoria = new MemoryStream();
        libro.SaveAs(memoria);
        return memoria.ToArray();
    }
}
