param([string]$BaseUrl = "http://localhost:3000")

$headers = @{ "Content-Type" = "application/json" }
$errors = @()

function Req {
    param($Method, $Path, $Body = $null, $Token = $null)
    $h = @{ "Content-Type" = "application/json" }
    if ($Token) { $h["Authorization"] = "Bearer $Token" }
    $uri = "$BaseUrl$Path"
    try {
        if ($Body) {
            $json = $Body | ConvertTo-Json -Compress -Depth 5
            $resp = Invoke-RestMethod -Uri $uri -Method $Method -Headers $h -Body $json -ErrorVariable ev
        } else {
            $resp = Invoke-RestMethod -Uri $uri -Method $Method -Headers $h -ErrorVariable ev
        }
        return $resp
    } catch {
        $raw = $_.ErrorDetails.Message
        try { return $raw | ConvertFrom-Json } catch { return @{ error = $raw } }
    }
}

function Check {
    param($Label, $Actual, $Expected)
    if ($Actual -ne $Expected) {
        Write-Host "FAIL [$Label]: got $Actual, want $Expected" -ForegroundColor Red
        $script:errors += $Label
    } else {
        Write-Host "PASS [$Label]" -ForegroundColor Green
    }
}

function CheckContains {
    param($Label, $Obj, $Field)
    if ($null -eq $Obj.$Field) {
        Write-Host "FAIL [$Label]: missing field '$Field'" -ForegroundColor Red
        $script:errors += $Label
    } else {
        Write-Host "PASS [$Label] ($Field present)" -ForegroundColor Green
    }
}

Write-Host "`n=== 1. Admin Login ===" -ForegroundColor Cyan
$login = Req POST "/admin/auth/login" @{ email = "admin@ownmypin.app"; password = "Admin@123456" }
$AT = $login.data.accessToken
$RT = $login.data.refreshToken
Check "login.success" $login.success $true
CheckContains "login.accessToken" $login.data "accessToken"
Check "login.role" $login.data.admin.role "SUPER_ADMIN"

Write-Host "`n=== 2. GET /admin/auth/me ===" -ForegroundColor Cyan
$me = Req GET "/admin/auth/me" -Token $AT
Check "me.success" $me.success $true
Check "me.role" $me.data.role "SUPER_ADMIN"

Write-Host "`n=== 3. GET /admin/dashboard ===" -ForegroundColor Cyan
$dash = Req GET "/admin/dashboard" -Token $AT
Check "dashboard.success" $dash.success $true
CheckContains "dashboard.users" $dash.data "users"
CheckContains "dashboard.digipins" $dash.data "digipins"
CheckContains "dashboard.businesses" $dash.data "businesses"

Write-Host "`n=== 4. GET /admin/users ===" -ForegroundColor Cyan
$users = Req GET "/admin/users" -Token $AT
Check "users.success" $users.success $true
CheckContains "users.total" $users.data "total"

Write-Host "`n=== 5. GET /admin/properties ===" -ForegroundColor Cyan
$props = Req GET "/admin/properties" -Token $AT
Check "properties.success" $props.success $true
CheckContains "properties.total" $props.data "total"

Write-Host "`n=== 6. GET /admin/businesses ===" -ForegroundColor Cyan
$biz = Req GET "/admin/businesses" -Token $AT
Check "businesses.success" $biz.success $true
CheckContains "businesses.total" $biz.data "total"

Write-Host "`n=== 7. GET /admin/categories (incl. inactive) ===" -ForegroundColor Cyan
$cats = Req GET "/admin/categories" -Token $AT
Check "categories.success" $cats.success $true
CheckContains "categories.total" $cats.data "total"

Write-Host "`n=== 8. POST /admin/categories ===" -ForegroundColor Cyan
$newCat = Req POST "/admin/categories" @{ name = "E2E Test Category"; order = 99 } -Token $AT
Check "create-category.success" $newCat.success $true
$catId = $newCat.data.id
CheckContains "create-category.id" $newCat.data "id"

Write-Host "`n=== 9. PATCH /admin/categories/:id ===" -ForegroundColor Cyan
if ($catId) {
    $patchCat = Req PATCH "/admin/categories/$catId" @{ name = "E2E Test Category (Updated)"; isActive = $false } -Token $AT
    Check "patch-category.success" $patchCat.success $true
}

Write-Host "`n=== 10. GET /admin/subscription-plans ===" -ForegroundColor Cyan
$plans = Req GET "/admin/subscription-plans" -Token $AT
Check "plans.success" $plans.success $true

Write-Host "`n=== 11. POST /admin/subscription-plans ===" -ForegroundColor Cyan
$newPlan = Req POST "/admin/subscription-plans" @{
    name = "E2E Pro Plan"; tier = "PREMIUM"; price = 499; durationDays = 30;
    features = @{ maxListings = 5 }; isActive = $true
} -Token $AT
Check "create-plan.success" $newPlan.success $true
$planId = $newPlan.data.id

Write-Host "`n=== 12. PATCH /admin/subscription-plans/:id ===" -ForegroundColor Cyan
if ($planId) {
    $patchPlan = Req PATCH "/admin/subscription-plans/$planId" @{ isActive = $false } -Token $AT
    Check "patch-plan.success" $patchPlan.success $true
}

Write-Host "`n=== 13. GET /admin/subscriptions ===" -ForegroundColor Cyan
$subs = Req GET "/admin/subscriptions" -Token $AT
Check "subscriptions.success" $subs.success $true

Write-Host "`n=== 14. GET /admin/transactions ===" -ForegroundColor Cyan
$txs = Req GET "/admin/transactions" -Token $AT
Check "transactions.success" $txs.success $true

Write-Host "`n=== 15. POST /admin/notifications/send (broadcast ALL) ===" -ForegroundColor Cyan
$broadcast = Req POST "/admin/notifications/send" @{
    target = "ALL"; title = "E2E Test Broadcast"; message = "This is a test."; type = "SYSTEM"
} -Token $AT
Check "broadcast.success" $broadcast.success $true
CheckContains "broadcast.sentCount" $broadcast.data "sentCount"

Write-Host "`n=== 16. GET /admin/notifications ===" -ForegroundColor Cyan
$notifs = Req GET "/admin/notifications" -Token $AT
Check "admin-notifications.success" $notifs.success $true

Write-Host "`n=== 17. POST /admin/admins (create sub-admin) ===" -ForegroundColor Cyan
$newAdmin = Req POST "/admin/admins" @{
    name = "E2E Verif Admin"; email = "verif-e2e@ownmypin.app"; password = "TestPass123!"; role = "VERIFICATION_ADMIN"
} -Token $AT
Check "create-admin.success" $newAdmin.success $true
$subAdminId = $newAdmin.data.id

Write-Host "`n=== 18. GET /admin/admins ===" -ForegroundColor Cyan
$admins = Req GET "/admin/admins" -Token $AT
Check "list-admins.success" $admins.success $true
CheckContains "list-admins.total" $admins.data "total"

Write-Host "`n=== 19. PATCH /admin/admins/:id (deactivate sub-admin) ===" -ForegroundColor Cyan
if ($subAdminId) {
    $patchAdmin = Req PATCH "/admin/admins/$subAdminId" @{ isActive = $false } -Token $AT
    Check "patch-admin.success" $patchAdmin.success $true
}

Write-Host "`n=== 20. RBAC: user JWT on admin route -> 401 ===" -ForegroundColor Cyan
$userJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzAwMSIsImlhdCI6MTc1NTAwMDAwMH0.fake"
$rbacUser = Req GET "/admin/dashboard" -Token $userJwt
$rbacCode = if ($rbacUser.error) { $rbacUser.error.code } else { $rbacUser.success }
Write-Host "  user-token-on-admin: code=$($rbacUser.error.code) success=$($rbacUser.success)"
Check "rbac.user-on-admin.not-success" $rbacUser.success $false

Write-Host "`n=== 21. Last-SUPER_ADMIN guardrail: cannot deactivate self ===" -ForegroundColor Cyan
$myId = $me.data.id
$selfDeact = Req PATCH "/admin/admins/$myId" @{ isActive = $false } -Token $AT
Check "guardrail.cannot-deactivate-self.not-success" $selfDeact.success $false
Write-Host "  error code: $($selfDeact.error.code)"

Write-Host "`n=== 22. Token refresh ===" -ForegroundColor Cyan
$refresh = Req POST "/admin/auth/refresh" @{ refreshToken = $RT }
Check "refresh.success" $refresh.success $true
$AT2 = $refresh.data.accessToken

Write-Host "`n=== 23. Logout ===" -ForegroundColor Cyan
$logout = Invoke-RestMethod -Uri "$BaseUrl/admin/auth/logout" -Method POST `
    -Headers @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $AT2" } `
    -Body (@{ refreshToken = $refresh.data.refreshToken } | ConvertTo-Json)
Write-Host "  logout HTTP status (204 = pass)"

Write-Host "`n=== 24. GET /admin/digipins ===" -ForegroundColor Cyan
$dps = Req GET "/admin/digipins" -Token $AT
Check "digipins.success" $dps.success $true

Write-Host "`n================================================" -ForegroundColor Cyan
if ($errors.Count -eq 0) {
    Write-Host "ALL CHECKS PASSED" -ForegroundColor Green
} else {
    Write-Host "FAILED CHECKS ($($errors.Count)):" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}
