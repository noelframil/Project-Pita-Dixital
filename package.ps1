Write-Host "Empaquetando Pita-Dixital para despliegue..."

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outputFile = "pita_dixital_deploy_$timestamp.zip"

# Usamos git archive para empaquetar de forma limpia (ignorando node_modules, .env, etc)
git archive --format=zip HEAD -o $outputFile

if ($?) {
    Write-Host "¡Paquete creado con éxito! -> $outputFile" -ForegroundColor Green
    Write-Host "Puedes subir este archivo a tu servidor (ej. DigitalOcean, AWS) y descomprimirlo para hacer docker compose up."
} else {
    Write-Host "Error al crear el paquete. Asegúrate de tener los cambios commiteados en Git." -ForegroundColor Red
}
