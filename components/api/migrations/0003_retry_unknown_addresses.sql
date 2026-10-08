-- Addresses Nominatim alone could not find are looked up again (national address base first).
delete from geocode_cache where lat is null;
