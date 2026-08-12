$AT = (Invoke-RestMethod -Uri 'http://localhost:3000/admin/auth/login' `
    -Method POST -ContentType 'application/json' `
    -Body '{"email":"admin@ownmypin.app","password":"Admin@123456"}').data.accessToken

Write-Host "--- Check 17: POST /admin/admins with dup email -> expect 409 ADMIN_EMAIL_EXISTS ---"
try {
    Invoke-RestMethod -Uri 'http://localhost:3000/admin/admins' `
        -Method POST -ContentType 'application/json' `
        -Headers @{ Authorization = "Bearer $AT" } `
        -Body '{"name":"X","email":"admin@ownmypin.app","password":"Pass123!","role":"ADMIN"}'
    Write-Host "UNEXPECTED 2xx (should have been 4xx)" -ForegroundColor Red
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $body   = $_.ErrorDetails.Message
    Write-Host "HTTP $status : $body"
    if ($status -eq 409) { Write-Host "PASS [create-admin dup -> 409]" -ForegroundColor Green }
    else                  { Write-Host "UNEXPECTED STATUS $status" -ForegroundColor Red }
}

Write-Host ""
Write-Host "--- Check 20: user JWT on /admin/dashboard -> expect 401 ---"
$fakeUserJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1MWlkIiwiaWF0IjoxNzU1MDAwMDAwfQ.fakeSignature"
try {
    Invoke-RestMethod -Uri 'http://localhost:3000/admin/dashboard' `
        -Method GET `
        -Headers @{ Authorization = "Bearer $fakeUserJwt" }
    Write-Host "UNEXPECTED 2xx (should have been 401)" -ForegroundColor Red
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $body   = $_.ErrorDetails.Message
    Write-Host "HTTP $status : $body"
    if ($status -eq 401) { Write-Host "PASS [user-jwt-on-admin -> 401]" -ForegroundColor Green }
    else                  { Write-Host "UNEXPECTED STATUS $status" -ForegroundColor Red }
}

Write-Host ""
Write-Host "--- Check 21: SUPER_ADMIN self-deactivate -> expect 400 CANNOT_DEACTIVATE_SELF ---"
$myId = (Invoke-RestMethod -Uri 'http://localhost:3000/admin/auth/me' `
    -Method GET -Headers @{ Authorization = "Bearer $AT" }).data.id
try {
    Invoke-RestMethod -Uri "http://localhost:3000/admin/admins/$myId" `
        -Method PATCH -ContentType 'application/json' `
        -Headers @{ Authorization = "Bearer $AT" } `
        -Body '{"isActive":false}'
    Write-Host "UNEXPECTED 2xx (should have been 4xx)" -ForegroundColor Red
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $body   = $_.ErrorDetails.Message
    Write-Host "HTTP $status : $body"
    if ($status -eq 400) { Write-Host "PASS [self-deactivate -> 400]" -ForegroundColor Green }
    else                  { Write-Host "UNEXPECTED STATUS $status" -ForegroundColor Red }
}
