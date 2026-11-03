using System.Text.Json.Serialization;

namespace AppGastos.Modelos;

[JsonConverter(typeof(JsonStringEnumConverter<TipoTransaccion>))]
public enum TipoTransaccion
{
    Gasto,
    Ingreso,
    Transferencia,
    Devolucion,
}
