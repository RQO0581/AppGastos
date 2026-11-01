using System.Text.Json.Serialization;

namespace AppGastos.Modelos;

[JsonConverter(typeof(JsonStringEnumConverter<TipoCuentaOrigen>))]
public enum TipoCuentaOrigen
{
    Efectivo,
    Banco,
    TarjetaCredito,
}
