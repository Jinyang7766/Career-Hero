param(
  [Parameter(Mandatory = $true)]
  [string]$FrontendUrl,
  [Parameter(Mandatory = $true)]
  [string]$BackendUrl,
  [string]$Email = $env:CAREER_HERO_TEST_EMAIL,
  [string]$Password = $env:CAREER_HERO_TEST_PASSWORD,
  [switch]$SkipUiLogin,
  [switch]$UiLoginHeaded,
  [switch]$RunLegacyJdInputMigrationUiSmoke
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Assert-HttpCode {
  param(
    [string]$Name,
    [int]$Actual,
    [int[]]$Allowed
  )
  if ($Allowed -notcontains $Actual) {
    throw "[$Name] expected status $($Allowed -join ',') but got $Actual"
  }
}

Write-Host "[online] Frontend health check..."
$frontResp = Invoke-WebRequest -Uri $FrontendUrl -Method GET -TimeoutSec 30 -SkipHttpErrorCheck
Assert-HttpCode -Name "frontend" -Actual ([int]$frontResp.StatusCode) -Allowed @(200)

Write-Host "[online] Backend templates check..."
$templatesResp = Invoke-WebRequest -Uri "$($BackendUrl.TrimEnd('/'))/api/templates" -Method GET -TimeoutSec 30 -SkipHttpErrorCheck
Assert-HttpCode -Name "backend.templates" -Actual ([int]$templatesResp.StatusCode) -Allowed @(200)

Write-Host "[online] Backend CORS preflight check..."
$headers = @{
  Origin = $FrontendUrl.TrimEnd('/')
  "Access-Control-Request-Method" = "GET"
}
$corsResp = Invoke-WebRequest -Uri "$($BackendUrl.TrimEnd('/'))/api/templates" -Method OPTIONS -Headers $headers -TimeoutSec 30 -SkipHttpErrorCheck
Assert-HttpCode -Name "backend.cors" -Actual ([int]$corsResp.StatusCode) -Allowed @(200, 204)

$aco = [string]$corsResp.Headers["Access-Control-Allow-Origin"]
if ([string]::IsNullOrWhiteSpace($aco)) {
  throw "[backend.cors] missing Access-Control-Allow-Origin header"
}

if ($RunLegacyJdInputMigrationUiSmoke -and $SkipUiLogin) {
  throw "[online.ui.legacy] -RunLegacyJdInputMigrationUiSmoke requires UI login; remove -SkipUiLogin"
}

if (-not $SkipUiLogin) {
  if ([string]::IsNullOrWhiteSpace($Email) -or [string]::IsNullOrWhiteSpace($Password)) {
    throw "[online.ui] missing Email/Password; pass params or set CAREER_HERO_TEST_EMAIL/CAREER_HERO_TEST_PASSWORD"
  }

  $uiMode = if ($UiLoginHeaded) { "headed" } else { "headless" }
  Write-Host "[online] UI login smoke via Playwright CLI ($uiMode)..."
  if ($RunLegacyJdInputMigrationUiSmoke) {
    Write-Host "[online] Legacy migration UI smoke enabled: jd_input -> interview_scene"
  }

  $session = "online-smoke-" + [Guid]::NewGuid().ToString("N").Substring(0, 10)
  $frontendLogin = "$($FrontendUrl.TrimEnd('/'))/login"
  $frontendProfile = "$($FrontendUrl.TrimEnd('/'))/profile"
  $frontendInterview = "$($FrontendUrl.TrimEnd('/'))/ai-interview"
  $openModeFlag = if ($UiLoginHeaded) { "--headed" } else { "--no-headed" }

  $scenarioPayload = @{
    loginUrl = $frontendLogin
    profileUrl = $frontendProfile
    interviewUrl = $frontendInterview
    email = $Email
    password = $Password
    runLegacyMigration = [bool]$RunLegacyJdInputMigrationUiSmoke
  }
  $payloadJson = $scenarioPayload | ConvertTo-Json -Compress

  $scriptTemplate = @'
async (page) => {
  const cfg = __PAYLOAD__;

  const makeJdKey = (text) => {
    const normalized = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!normalized) return 'jd_default';
    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
    }
    return `jd_${Math.abs(hash)}`;
  };

  const mutateLegacySession = (record, resumeId, legacyJdText) => {
    if (!record || typeof record !== 'object') return record;
    if (String(record.id || '').trim() !== String(resumeId || '').trim()) return record;

    const patched = { ...record };
    const resumeData = { ...(patched.resume_data || {}) };
    const jdText = String(resumeData.lastJdText || legacyJdText || '').trim() || legacyJdText;
    const jdKey = makeJdKey(jdText);
    const targetCompany = String(
      resumeData.targetCompany || resumeData.targetRole || 'Legacy interview migration smoke target'
    ).trim();
    const sessionKey = `${jdKey}__general__interview`;

    const byJd = { ...(resumeData.analysisSessionByJd || {}) };
    byJd[sessionKey] = {
      ...(byJd[sessionKey] || {}),
      jdKey,
      jdText,
      chatMode: 'interview',
      interviewType: 'general',
      step: 'jd_input',
      state: 'jd_ready',
      targetCompany,
      updatedAt: new Date().toISOString(),
    };

    patched.resume_data = {
      ...resumeData,
      lastJdText: jdText,
      targetCompany,
      analysisSessionByJd: byJd,
      latestAnalysisStep: 'jd_input',
    };

    return patched;
  };

  const assertRecoveredToInterviewScene = async () => {
    const interviewSceneTitle = page.getByRole('heading', { name: '设置面试场景' });
    await interviewSceneTitle.waitFor({ timeout: 30000 });

    const jdInputTitleVisible = await page
      .getByRole('heading', { name: '添加职位描述' })
      .isVisible()
      .catch(() => false);

    if (jdInputTitleVisible) {
      throw new Error('[legacy-ui] legacy jd_input recovery stayed on jd_input; expected interview_scene');
    }

    try {
      await page.waitForFunction(() => {
        const step = String(localStorage.getItem('ai_analysis_step') || '').trim().toLowerCase();
        return step === 'interview_scene';
      }, { timeout: 30000 });
    } catch {
      throw new Error('[legacy-ui] recovery did not persist ai_analysis_step=interview_scene');
    }
  };

  await page.goto(cfg.loginUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: '电子邮箱' }).fill(cfg.email);
  await page.getByRole('textbox', { name: '密码' }).fill(cfg.password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/dashboard', { timeout: 30000 });

  await page.goto(cfg.profileUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`text=${cfg.email}`, { timeout: 30000 });

  if (!cfg.runLegacyMigration) return;

  await page.goto(cfg.interviewUrl, { waitUntil: 'domcontentloaded' });
  const noInterviewResume = page.getByText('暂无可用于面试的诊断简历');
  if (await noInterviewResume.isVisible().catch(() => false)) {
    throw new Error('[legacy-ui] no generated diagnosis resume available for interview smoke account');
  }

  const resumeRows = page.locator('div.group.relative.cursor-pointer');
  const rowCount = await resumeRows.count();
  if (!rowCount) {
    throw new Error('[legacy-ui] failed to locate interview resume rows on /ai-interview');
  }

  await resumeRows.first().click();
  await page.getByRole('heading', { name: '设置面试场景' }).waitFor({ timeout: 30000 });

  const selectedResumeId = await page.evaluate(() => {
    const byAnalysis = String(localStorage.getItem('ai_analysis_resume_id') || '').trim();
    const byInterview = String(localStorage.getItem('ai_interview_resume_id') || '').trim();
    return byAnalysis || byInterview || '';
  });
  if (!selectedResumeId) {
    throw new Error('[legacy-ui] missing selected resume id after entering interview scene');
  }

  const legacyJdText = 'legacy jd_input smoke migration text';
  let responsePatched = false;
  const routePattern = '**/rest/v1/resumes*';

  await page.route(routePattern, async (route) => {
    const reqUrl = route.request().url();
    if (!reqUrl.includes('/rest/v1/resumes')) {
      await route.continue();
      return;
    }

    let response;
    try {
      response = await route.fetch();
    } catch {
      await route.continue();
      return;
    }

    const contentType = String(response.headers()['content-type'] || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      await route.fulfill({ response });
      return;
    }

    let body;
    try {
      body = await response.json();
    } catch {
      await route.fulfill({ response });
      return;
    }

    const mutateIfTarget = (item) => {
      const beforeId = String(item?.id || '').trim();
      if (!beforeId || beforeId !== String(selectedResumeId)) return item;
      responsePatched = true;
      return mutateLegacySession(item, selectedResumeId, legacyJdText);
    };

    if (Array.isArray(body)) {
      body = body.map((item) => mutateIfTarget(item));
    } else if (body && typeof body === 'object') {
      body = mutateIfTarget(body);
    }

    const headers = { ...response.headers() };
    delete headers['content-length'];
    delete headers['Content-Length'];

    await route.fulfill({
      status: response.status(),
      headers,
      body: JSON.stringify(body),
    });
  });

  try {
    await page.evaluate(({ resumeId }) => {
      const getUid = () => {
        const scoped = String(localStorage.getItem('ai_analysis_user_id') || '').trim();
        if (scoped) return scoped;
        try {
          const session = JSON.parse(localStorage.getItem('supabase_session') || '{}');
          return String(session?.user?.id || '').trim();
        } catch {
          return '';
        }
      };

      const uid = getUid();
      if (uid) {
        localStorage.setItem('ai_nav_owner_user_id', uid);
        localStorage.setItem(`ai_interview_type:${uid}`, 'general');
      }
      localStorage.setItem('ai_interview_type', 'general');
      localStorage.setItem('ai_analysis_step', 'jd_input');
      localStorage.setItem('ai_interview_open', '1');
      localStorage.setItem('ai_interview_resume_id', String(resumeId));
      localStorage.setItem('ai_interview_entry_mode', 'chat');
      localStorage.removeItem('ai_interview_force_resume_select');
    }, { resumeId: selectedResumeId });

    await page.goto(cfg.interviewUrl, { waitUntil: 'domcontentloaded' });

    await assertRecoveredToInterviewScene();

    if (!responsePatched) {
      throw new Error('[legacy-ui] failed to inject legacy jd_input analysis session into resume payload');
    }
  } finally {
    await page.unroute(routePattern);
  }
}
'@

  $script = $scriptTemplate.Replace('__PAYLOAD__', $payloadJson)

  & npx --yes --package @playwright/cli playwright-cli -s=$session open $frontendLogin $openModeFlag | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "[online.ui] failed to open browser session" }

  try {
    & npx --yes --package @playwright/cli playwright-cli -s=$session run-code $script | Out-Null
    if ($LASTEXITCODE -ne 0) {
      if ($RunLegacyJdInputMigrationUiSmoke) {
        throw "[online.ui.legacy] migration smoke failed"
      }
      throw "[online.ui] login smoke failed"
    }
  } finally {
    & npx --yes --package @playwright/cli playwright-cli -s=$session close | Out-Null
  }
}

Write-Host "[online] All online smoke checks passed."
