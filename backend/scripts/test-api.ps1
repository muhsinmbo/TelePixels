# STANDARD BUILD — end-to-end API workflow test (backend-first, no frontend needed).
# Usage:
#   $env:API = 'http://localhost:4000'; $env:EMAIL = 'admin@kingsimaging.org'; $env:PASS = 'ChangeMe123!'
#   .\scripts\test-api.ps1
$API = $env:API; if (!$API) { $API = 'http://localhost:4000' }
$EMAIL = $env:EMAIL; if (!$EMAIL) { $EMAIL = 'admin@kingsimaging.org' }
$PASS = $env:PASS; if (!$PASS) { $PASS = 'ChangeMe123!' }
$fail = 0
function Check($name, $cond) {
  if ($cond) { Write-Host "PASS  $name" } else { Write-Host "FAIL  $name"; $script:fail++ }
}
function Call($method, $path, $body, $token) {
  $h = @{}; if ($token) { $h['Authorization'] = "Bearer $token" }
  $p = @{ Uri = "$API$path"; Method = $method; TimeoutSec = 15 }
  if ($h.Count) { $p['Headers'] = $h }
  if ($body) { $p['ContentType'] = 'application/json'; $p['Body'] = ($body | ConvertTo-Json -Depth 6) }
  try { return Invoke-RestMethod @p } catch { $detail = $_.ErrorDetails.Message; if (!$detail) { $detail = $_.Exception.Message }; Write-Host "  ERROR $method $path : $detail"; return $null }
}

$health = Call 'GET' '/health' $null $null
Check 'health' ($health.status -eq 'ok')

$login = Call 'POST' '/api/auth/login' @{ email = $EMAIL; password = $PASS } $null
Check 'login (real bcrypt+JWT)' ($login.token -and $login.user.role -eq 'superadmin')
$T = $login.token

$me = Call 'GET' '/api/auth/me' $null $T
Check 'me' ($me.email -eq $EMAIL.ToLower())

$bad = Call 'GET' '/api/auth/me' $null 'bogus-token'
Check 'invalid token rejected' ($null -eq $bad)

$patient = Call 'POST' '/api/patients' @{ name = 'Test Patient'; age = 32; gender = 'Female'; mrn = "TEST-$(Get-Random -Max 999999)" } $T
Check 'create patient' ($patient.id -like 'KP-*')
$PID_ = $patient.id

$req = Call 'POST' "/api/patients/$PID_/requests" @{ modalities = @('Ultrasound'); procedures = @('Pelvic Ultrasound'); clinicalInfo = 'Lower abdominal pain'; priority = 'routine' } $T
Check 'create request (Pending)' ($req.status -eq 'Pending')
$RID = $req.id

$img = Call 'POST' "/api/patients/$PID_/requests/$RID/images" @{ name = 'scan1.jpg'; url = '/uploads/scan1.jpg'; storagePath = 'scan1.jpg' } $T
Check 'add image' ($img.id -like 'img_*')
$req2 = Call 'GET' "/api/patients/$PID_/requests/$RID" $null $T
Check 'request flipped to Images Uploaded' ($req2.status -eq 'Images Uploaded')

$rep = Call 'POST' "/api/patients/$PID_/requests/$RID/reports" @{ findings = 'Uterus normal size.'; impression = 'No significant abnormality.' } $T
Check 'finalize report (superadmin bypasses radiologist-only)' ($rep.status -eq 'Finalized')
$req3 = Call 'GET' "/api/patients/$PID_/requests/$RID" $null $T
Check 'request Completed via report' ($req3.status -eq 'Completed')

$portal = Call 'POST' '/api/portal/verify' @{ mrn = $patient.mrn; accessCode = $patient.accessCode } $null
Check 'portal verify (public)' ($portal.patient.id -eq $PID_)

$logs = Call 'GET' '/api/logs?limit=5' $null $T
Check 'audit logs' ($logs.Count -ge 1)

Write-Host ""
if ($fail -eq 0) { Write-Host "ALL CHECKS PASSED" } else { Write-Host "$fail CHECK(S) FAILED" -ForegroundColor Red; exit 1 }
