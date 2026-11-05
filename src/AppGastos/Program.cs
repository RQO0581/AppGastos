using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using AppGastos;
using AppGastos.Servicios;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddScoped<CompartirArchivos>();
builder.Services.AddScoped<Almacen>();
builder.Services.AddScoped<AvisoPendiente>();
builder.Services.AddScoped<ServicioTestamento>();
builder.Services.AddScoped<ServicioRespaldo>();

await builder.Build().RunAsync();
