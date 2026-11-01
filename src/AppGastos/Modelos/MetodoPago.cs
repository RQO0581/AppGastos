using System.Text.Json.Serialization;

namespace AppGastos.Modelos;

// Se guarda como texto: si cambia el orden del enum, los datos ya guardados siguen siendo correctos.
[JsonConverter(typeof(JsonStringEnumConverter<MetodoPago>))]
public enum MetodoPago
{
    Efectivo,
    TarjetaDebito,
    TarjetaCredito,
    AthMovil,
}
