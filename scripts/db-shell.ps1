$container = "mobiliti-dashboard-postgres16"
$dbName = "dashboard-mobiliti_lokal"

docker exec -it $container psql -U postgres -d $dbName
