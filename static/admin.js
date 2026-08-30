(() => {
  const $=id=>document.getElementById(id); let currentAdmin=null;
  const UI_KEY='traffic_catcher_ui_preference';
  const uiDefaults={font_family:'paperlogy',font_scale:'normal',font_weight:'400',theme_mode:'system'};
  const fontMap={paperlogy:'"Paperlogy", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',pretendard:'"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',suit:'"SUIT Variable", SUIT, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',noto:'"Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',system:'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',serif:'Georgia, "Noto Serif KR", serif'};
  const scaleMap={compact:14.5,normal:16,large:17.5};
  function applyUiPreference(value){const pref={...uiDefaults,...(value||{})};document.documentElement.style.fontSize=`${scaleMap[pref.font_scale]||16}px`;document.documentElement.style.setProperty('--tc-user-font',fontMap[pref.font_family]||fontMap.paperlogy);document.documentElement.style.setProperty('--tc-user-weight',pref.font_weight||'400');window.TrafficCatcherTheme?.syncPreference(pref.theme_mode);document.dispatchEvent(new CustomEvent('tc:ui-preference-applied',{detail:pref}));try{localStorage.setItem(UI_KEY,JSON.stringify(pref))}catch(_){} }
  function cachedUiPreference(){try{return{...uiDefaults,...JSON.parse(localStorage.getItem(UI_KEY)||'{}')}}catch(_){return{...uiDefaults}}}
  applyUiPreference(cachedUiPreference());
  async function api(url,options={}){const res=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const data=await res.json().catch(()=>({message:`HTTP ${res.status}`}));if(!res.ok)throw new Error(data.message||'요청에 실패했습니다.');return data}
  function sectionLoading(id,loading){const section=$(id);if(!section)return;section.classList.toggle('is-loading',loading);section.setAttribute('aria-busy',String(loading))}
  function progress(value,label){const root=$('admin-page-progress');if(!root)return;const safe=Math.max(0,Math.min(100,Number(value)||0));root.classList.remove('is-complete');root.setAttribute('aria-valuenow',String(safe));root.querySelector('i').style.width=`${safe}%`;root.querySelector('span').textContent=label||'관리자 데이터 불러오는 중';if(safe>=100)setTimeout(()=>root.classList.add('is-complete'),450)}
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function date(v){if(!v)return '-';const d=new Date(v);return Number.isNaN(d.getTime())?escapeHtml(v):d.toLocaleString('ko-KR',{dateStyle:'short',timeStyle:'short'})}
  function status(message,type=''){$('admin-status').textContent=message;$('admin-status').className=`admin-status ${type}`}
  const roleLabels={member:'일반 회원',premium:'유료 회원',operator:'운영자',admin:'관리자'};
  const planLabels={free:'Free',plus:'Plus',pro:'Pro'};
  const actionLabels={'user.update':'회원 권한 변경','credits.grant':'글쓰기 쿠폰 지급','credits.set':'글쓰기 가능 건수 설정','service_plans.update':'서비스 등급 설정 변경','billing.settings.update':'결제 설정 변경'};
  const usageStatusLabels={completed:'완료',failed:'실패',in_progress:'진행 중',queued:'대기 중',cancelled:'취소',canceled:'취소',timed_out:'시간 초과',incomplete:'미완료',budget_exceeded:'처리 한도 초과'};
  const usageOperationLabels={article:'새 글',revision:'글 보완'};
  const usageModeLabels={keyword:'키워드·뉴스',story:'메모·스토리'};
  const usageExecutionLabels={local_server:'로컬 서버',cloud_direct:'운영 서버',cloud_relay:'한국 중계',cloud_background:'백그라운드'};
  const usageSourceLabels={keyword_only:'키워드만',news:'뉴스 팩트',youtube:'YouTube 팩트',story:'사용자 원고',revision:'기존 글 보완',unknown:'이전 기록'};
  const usageErrorLabels={TIMEOUT:'응답 시간 초과',AI_CAPACITY:'AI 서비스 혼잡',AI_AUTH:'AI 인증 오류',NETWORK:'네트워크 오류',CREDIT_REQUIRED:'사용 건수 부족',PROCESSING_ERROR:'처리 오류',BACKGROUND_REGISTRATION:'작업 등록 오류',USER_CANCELLED:'사용자 취소'};
  function duration(ms){const value=Number(ms||0);if(value<=0)return '시간 미집계';if(value<1000)return value+'ms';if(value<60000)return (value/1000).toFixed(value<10000?1:0)+'초';return Math.floor(value/60000)+'분 '+Math.round(value%60000/1000)+'초'}
  function row(user){
    const self=user.id===currentAdmin?.id;
    const unlimited=['premium','operator','admin'].includes(user.role);
    const balance=Number(user.credit_balance||0);
    const creditControl=unlimited
      ? `<span class="credit-unlimited">무제한<small>운영 역할 정책</small></span>`
      : `<div class="credit-editor"><input class="credit-input" type="number" min="0" max="1000000" value="${balance}" aria-label="${escapeHtml(user.nickname)} 글쓰기 가능 건수"><button class="credit-save" type="button">건수 저장</button></div>`;
    const detailId=`member-detail-${String(user.id).replace(/[^a-zA-Z0-9_-]/g,'-')}`;
    return `<tr class="member-summary-row" data-id="${escapeHtml(user.id)}" tabindex="0" aria-expanded="false" aria-controls="${detailId}"><td class="member-name"><strong>${escapeHtml(user.nickname)}${self?'<span class="self-badge" data-tooltip="현재 로그인한 관리자 계정">나</span>':''}</strong><span>${escapeHtml(user.email)}</span></td><td class="date-cell">${date(user.created_at)}<span>최근 ${date(user.last_login_at)}</span></td><td><select class="role" aria-label="${escapeHtml(user.nickname)} 운영 역할"><option value="member" ${user.role==='member'?'selected':''}>일반 회원</option><option value="premium" ${user.role==='premium'?'selected':''}>유료 회원</option><option value="operator" ${user.role==='operator'?'selected':''}>운영자</option><option value="admin" ${user.role==='admin'?'selected':''}>관리자</option></select></td><td><select class="plan" aria-label="${escapeHtml(user.nickname)} 서비스 등급"><option value="free" ${user.plan_code==='free'?'selected':''}>Free</option><option value="plus" ${user.plan_code==='plus'?'selected':''}>Plus</option><option value="pro" ${user.plan_code==='pro'?'selected':''}>Pro</option></select></td><td><select class="state" aria-label="${escapeHtml(user.nickname)} 이용 상태"><option value="active" ${user.status==='active'?'selected':''}>정상</option><option value="suspended" ${user.status==='suspended'?'selected':''}>이용 정지</option></select></td><td class="credit-cell">${creditControl}</td><td><div class="row-actions"><button class="save" type="button">설정 저장</button><span class="row-expand-label" aria-hidden="true">상세 <i>›</i></span></div></td></tr><tr id="${detailId}" class="member-detail-row" data-detail-for="${escapeHtml(user.id)}" hidden><td colspan="7"><div class="member-detail-content"><p class="member-detail-loading"><span class="member-detail-spinner" aria-hidden="true"></span><span>회원 상세 정보를 불러오는 중입니다.</span></p></div></td></tr>`;
  }  function detailMetric(label,value,suffix=''){return `<div><span>${escapeHtml(label)}</span><strong>${Number(value||0).toLocaleString()}${escapeHtml(suffix)}</strong></div>`}
  function renderMemberDetail(data){
    const user=data.user||{},credits=data.credits||{},activity=data.activity||{};
    const jobs=Array.isArray(data.recent_jobs)?data.recent_jobs:[];
    const logs=Array.isArray(data.audit_logs)?data.audit_logs:[];
    const unlimited=['premium','operator','admin'].includes(user.role);
    const jobsHtml=jobs.length?jobs.map(job=>{const state=String(job.status||'in_progress');const errorLabel=job.error_code?(usageErrorLabels[job.error_code]||job.error_code):'';return `<li><span class="member-history-state ${escapeHtml(state)}">${escapeHtml(usageStatusLabels[state]||state)}</span><div class="member-job-copy"><strong>${escapeHtml(usageOperationLabels[job.operation]||'글쓰기')} · ${escapeHtml(usageModeLabels[job.writing_mode]||'키워드·뉴스')}</strong><small>${escapeHtml(job.model||'AI 모델')} · ${escapeHtml(usageExecutionLabels[job.execution_type]||job.execution_type||'실행 환경 미확인')} · ${escapeHtml(usageSourceLabels[job.source_kind]||job.source_kind||'자료 유형 미확인')}</small><small>입력 ${Number(job.input_chars||0).toLocaleString()}자 · 출력 ${Number(job.output_chars||0).toLocaleString()}자 · ${duration(job.duration_ms)} · 사용량 ${Number(job.usage_units||1)}회${Number(job.credit_refunded||0)?' · 쿠폰 환불':(Number(job.credit_charged||0)?' · 쿠폰 차감':'')}${errorLabel?` · ${escapeHtml(errorLabel)}`:''}</small></div><time>${date(job.created_at)}</time></li>`}).join(''):'<li class="member-history-empty">최근 글쓰기 실행 내역이 없습니다.</li>';
    const logsHtml=logs.length?logs.map(log=>`<li><div><strong>${escapeHtml(actionLabels[log.action]||log.action||'관리 변경')}</strong><span>${escapeHtml(log.admin_name||'관리자')}</span></div><p>${escapeHtml(log.before_value||'-')} → ${escapeHtml(log.after_value||'-')}${log.reason?` · ${escapeHtml(log.reason)}`:''}</p><time>${date(log.created_at)}</time></li>`).join(''):'<li class="member-history-empty">최근 관리자 변경 내역이 없습니다.</li>';
    return `<div class="member-detail-grid"><section><h3>계정 세부 정보</h3><dl><div><dt>회원 ID</dt><dd>${escapeHtml(user.id||'-')}</dd></div><div><dt>이메일 인증</dt><dd>${user.email_verified_at?date(user.email_verified_at):'미인증'}</dd></div><div><dt>운영 역할</dt><dd>${escapeHtml(roleLabels[user.role]||user.role||'-')}</dd></div><div><dt>서비스 등급</dt><dd>${escapeHtml(planLabels[user.plan_code]||user.plan_code||'Free')}</dd></div><div><dt>이용 상태</dt><dd>${user.status==='active'?'정상':'이용 정지'}</dd></div><div><dt>가입일</dt><dd>${date(user.created_at)}</dd></div><div><dt>최근 로그인</dt><dd>${date(user.last_login_at)}</dd></div><div><dt>최근 정보 변경</dt><dd>${date(user.updated_at)}</dd></div></dl></section><section><h3>글쓰기 이용 현황</h3><div class="member-detail-metrics">${unlimited?'<div><span>현재 가능</span><strong>무제한</strong></div>':detailMetric('현재 가능',credits.balance,'건')}${detailMetric('누적 지급',credits.earned_total,'건')}${detailMetric('누적 사용',credits.used_total,'건')}${detailMetric('미완의 글서랍',activity.draft_count,'건')}${detailMetric('전체 글쓰기',activity.writing_jobs,'건')}${detailMetric('완료',activity.completed_jobs,'건')}${detailMetric('실패',activity.failed_jobs,'건')}${detailMetric('이번 달 실행',activity.current_month_jobs,'건')}${detailMetric('이번 달 사용량',activity.current_month_units,'회')}${detailMetric('누적 사용량',activity.usage_units,'회')}${detailMetric('활성 로그인',activity.active_sessions,'개')}${detailMetric('추천 연결',activity.referral_count,'건')}</div><p class="member-credit-updated">글쓰기 건수 최종 변경: ${date(credits.updated_at)}</p></section></div><div class="member-history-grid"><section><h3>최근 글쓰기 실행 내역</h3><p class="member-history-privacy">입력 원문·완성 글·URL·API 키·IP는 저장하지 않으며 실행 메타데이터만 400일간 보관합니다.</p><ul class="member-job-list">${jobsHtml}</ul></section><section><h3>최근 관리자 변경 내역</h3><ul class="member-audit-list">${logsHtml}</ul></section></div>`;
  }
  async function loadMemberDetail(id,detailRow,force=false){
    if(!detailRow||(!force&&detailRow.dataset.loaded==='true'))return;
    const content=detailRow.querySelector('.member-detail-content');
    content.innerHTML='<p class="member-detail-loading"><span class="member-detail-spinner" aria-hidden="true"></span><span>회원 상세 정보를 불러오는 중입니다.</span></p>';
    try{const data=await api(`/api/admin/users/${encodeURIComponent(id)}/detail`);content.innerHTML=renderMemberDetail(data);detailRow.dataset.loaded='true'}catch(error){content.innerHTML=`<p class="member-detail-error">${escapeHtml(error.message)}</p>`}
  }
  async function toggleMemberDetail(summaryRow){
    const id=summaryRow?.dataset.id;if(!id)return;
    const detailRow=document.querySelector(`.member-detail-row[data-detail-for="${CSS.escape(id)}"]`);if(!detailRow)return;
    const opening=detailRow.hidden;
    document.querySelectorAll('.member-detail-row:not([hidden])').forEach(row=>{row.hidden=true;const owner=document.querySelector(`.member-summary-row[data-id="${CSS.escape(row.dataset.detailFor||'')}"]`);owner?.setAttribute('aria-expanded','false')});
    document.querySelectorAll('.member-summary-row.is-expanded').forEach(row=>row.classList.remove('is-expanded'));
    if(!opening)return;
    detailRow.hidden=false;summaryRow.classList.add('is-expanded');summaryRow.setAttribute('aria-expanded','true');await loadMemberDetail(id,detailRow,true);
  }
  const servicePlanCodes=['free','plus','pro'];
  let servicePlanDefinitions=[],servicePlanEntitlements={},servicePlansLoaded=false,servicePlansLoading=null;
  function servicePlanControl(definition,planCode,value){
    const common=`data-plan="${planCode}" data-key="${escapeHtml(definition.key)}" aria-label="${escapeHtml(planLabels[planCode])} ${escapeHtml(definition.label)}"`;
    if(definition.type==='boolean')return `<label class="service-plan-switch"><input class="service-plan-control" type="checkbox" ${common} ${value?'checked':''}><span>${value?'제공':'미제공'}</span></label>`;
    if(definition.type==='enum')return `<select class="service-plan-control service-plan-select" ${common}>${(definition.options||[]).map(option=>`<option value="${escapeHtml(option.value)}" ${String(value)===option.value?'selected':''}>${escapeHtml(option.label)}</option>`).join('')}</select>`;
    return `<label class="service-plan-number"><input class="service-plan-control" type="number" min="${Number(definition.min||0)}" max="${Number(definition.max||0)}" value="${Number(value||0)}" ${common}><span>${escapeHtml(definition.unit||'')}</span></label>`;
  }
  function renderServicePlans(){
    const body=$('service-plan-rows');
    body.innerHTML=servicePlanDefinitions.map(definition=>`<tr><td><strong>${escapeHtml(definition.label)}</strong><span>${escapeHtml(definition.description||'')}</span></td>${servicePlanCodes.map(planCode=>`<td>${servicePlanControl(definition,planCode,servicePlanEntitlements[planCode]?.[definition.key])}</td>`).join('')}</tr>`).join('');
    body.querySelectorAll('.service-plan-switch input').forEach(input=>input.addEventListener('change',()=>{input.nextElementSibling.textContent=input.checked?'제공':'미제공'}));
  }
  async function loadServicePlans(force=false){
    if(servicePlansLoaded&&!force)return {definitions:servicePlanDefinitions,entitlements:servicePlanEntitlements};
    if(servicePlansLoading)return servicePlansLoading;
    sectionLoading('admin-service-plans-section',true);
    $('service-plan-status').textContent='서비스 등급별 최신 설정을 불러오는 중입니다.';
    $('service-plan-status').className='admin-status';
    servicePlansLoading=(async()=>{try{const data=await api('/api/admin/service-plans');servicePlanDefinitions=Array.isArray(data.definitions)?data.definitions:[];servicePlanEntitlements=data.entitlements||{};servicePlansLoaded=true;renderServicePlans();$('service-plan-status').textContent='현재 서비스 등급별 제한과 제공 기능을 불러왔습니다.';$('service-plan-status').className='admin-status';return data}catch(e){$('service-plan-status').textContent=e.message;$('service-plan-status').className='admin-status error';throw e}finally{sectionLoading('admin-service-plans-section',false);servicePlansLoading=null}})();
    return servicePlansLoading;
  }
  async function saveServicePlans(){
    const button=$('save-service-plans'),entitlements=Object.fromEntries(servicePlanCodes.map(code=>[code,{}]));
    document.querySelectorAll('.service-plan-control').forEach(control=>{entitlements[control.dataset.plan][control.dataset.key]=control.type==='checkbox'?control.checked:(control.type==='number'?Number(control.value):control.value)});
    button.disabled=true;
    try{const data=await api('/api/admin/service-plans',{method:'PATCH',body:JSON.stringify({entitlements})});servicePlanEntitlements=data.entitlements||entitlements;renderServicePlans();$('service-plan-status').textContent=`저장 완료 · ${date(data.updated_at)}`;$('service-plan-status').className='admin-status'}catch(e){$('service-plan-status').textContent=e.message;$('service-plan-status').className='admin-status error'}finally{button.disabled=false}
  }
  const permissionFeatures=[['dashboard.extended','확장 대시보드','방송·시즌·주식 등 로그인 전용 데이터'],['studio.access','글쓰기 페이지','글쓰기 화면 접근'],['ai.write','글 작성','블로그 글과 쇼츠 생성 실행'],['ai.personalize','AI 개인화 설정','페르소나·시스템 지침 저장'],['billing.access','결제 및 쿠폰','결제·쿠폰 관련 기능 접근'],['admin.members','회원 관리','회원 역할·상태·쿠폰 관리'],['admin.permissions','권한 설정','등급별 기능 권한 변경']];
  const permissionRoles=['member','premium','operator','admin']; let permissionMatrix={},permissionsLoaded=false,permissionsLoading=null;
  let aiRoutingMode='direct',aiRelayConfigured=false,aiRelaySecure=false;
  let newsSearchMode='google_then_naver';
  let aiModels=[];
  let billingSettings={payment_enabled:false,donation_enabled:false,donation_url:''},billingSettingsLoaded=false,billingSettingsLoading=null;
  const newsSearchLabels={naver_only:'네이버 뉴스',google_only:'Google News',naver_then_google:'네이버 뉴스 → Google News',google_then_naver:'Google News → 네이버 뉴스'};
  function renderAiRouting(){document.querySelectorAll('input[name="ai-routing-mode"]').forEach(input=>{input.checked=input.value===aiRoutingMode;if(input.value==='korea_relay')input.disabled=!aiRelayConfigured});const badge=$('korea-relay-state');if(badge){badge.textContent=!aiRelayConfigured?'서버 설정 필요':aiRelaySecure?'중계 설정 완료':'HTTP 임시 연결';badge.className=aiRelayConfigured&&aiRelaySecure?'ready':'missing'}}
  async function loadAiRouting(){sectionLoading('admin-ai-routing-section',true);try{const data=await api('/api/admin/ai-routing');aiRoutingMode=data.mode==='korea_relay'?'korea_relay':'direct';aiRelayConfigured=Boolean(data.relay_configured);aiRelaySecure=Boolean(data.relay_secure);renderAiRouting();$('ai-routing-status').textContent=`현재 연결 방식: ${aiRoutingMode==='korea_relay'?'한국 서버 경유':'Cloudflare 직접 연결'}${data.updated_at?` · 최종 변경 ${date(data.updated_at)}`:''}`;$('ai-routing-status').className=aiRoutingMode==='korea_relay'&&aiRelayConfigured&&!aiRelaySecure?'admin-status error':'admin-status';return data}catch(e){$('ai-routing-status').textContent=e.message;$('ai-routing-status').className='admin-status error';throw e}finally{sectionLoading('admin-ai-routing-section',false)}}
  async function saveAiRouting(){const button=$('save-ai-routing');const selected=document.querySelector('input[name="ai-routing-mode"]:checked')?.value;if(!selected)return;button.disabled=true;try{const data=await api('/api/admin/ai-routing',{method:'PATCH',body:JSON.stringify({mode:selected})});aiRoutingMode=data.mode;aiRelayConfigured=Boolean(data.relay_configured);aiRelaySecure=Boolean(data.relay_secure);renderAiRouting();$('ai-routing-status').textContent=`저장 완료 · 다음 요청부터 ${aiRoutingMode==='korea_relay'?'한국 서버 경유':'Cloudflare 직접 연결'} 적용`;$('ai-routing-status').className=aiRoutingMode==='korea_relay'&&aiRelayConfigured&&!aiRelaySecure?'admin-status error':'admin-status'}catch(e){$('ai-routing-status').textContent=e.message;$('ai-routing-status').className='admin-status error'}finally{button.disabled=false}}
  function renderNewsSearch(){document.querySelectorAll('input[name="news-search-mode"]').forEach(input=>{input.checked=input.value===newsSearchMode})}
  async function loadNewsSearch(){sectionLoading('admin-news-search-section',true);try{const data=await api('/api/admin/news-search');newsSearchMode=newsSearchLabels[data.mode]?data.mode:'google_then_naver';renderNewsSearch();$('news-search-status').textContent=`현재 검색 방식: ${newsSearchLabels[newsSearchMode]}${data.updated_at?` · 최종 변경 ${date(data.updated_at)}`:''}`;$('news-search-status').className='admin-status';return data}catch(e){$('news-search-status').textContent=e.message;$('news-search-status').className='admin-status error';throw e}finally{sectionLoading('admin-news-search-section',false)}}
  async function saveNewsSearch(){const button=$('save-news-search');const selected=document.querySelector('input[name="news-search-mode"]:checked')?.value;if(!selected)return;button.disabled=true;try{const data=await api('/api/admin/news-search',{method:'PATCH',body:JSON.stringify({mode:selected})});newsSearchMode=data.mode;renderNewsSearch();$('news-search-status').textContent=`저장 완료 · 다음 뉴스 검색부터 ${newsSearchLabels[newsSearchMode]} 적용`;$('news-search-status').className='admin-status'}catch(e){$('news-search-status').textContent=e.message;$('news-search-status').className='admin-status error'}finally{button.disabled=false}}
  function renderAiModels(){const list=$('ai-model-admin-list');list.innerHTML=aiModels.map(model=>`<label class="ai-model-admin-row"><input class="ai-model-enabled" type="checkbox" data-model-value="${escapeHtml(model.value)}" ${model.enabled?'checked':''} aria-label="${escapeHtml(model.label)} 공개"><span class="ai-model-admin-copy"><strong>${escapeHtml(model.label)}</strong><small>${escapeHtml(model.value)} · ${escapeHtml(model.title||'')}</small></span><input class="ai-model-badge-input" type="text" maxlength="20" value="${escapeHtml(model.badge||'')}" placeholder="예: 추천, 응답속도 느림" aria-label="${escapeHtml(model.label)} 상태 뱃지"></label>`).join('')}
  async function loadAiModels(){sectionLoading('admin-ai-models-section',true);try{const data=await api('/api/admin/ai-models');aiModels=Array.isArray(data.models)?data.models:[];renderAiModels();$('ai-models-status').textContent=`공개 모델 ${aiModels.filter(model=>model.enabled).length}개${data.updated_at?` · 최종 변경 ${date(data.updated_at)}`:''}`;$('ai-models-status').className='admin-status';return data}catch(e){$('ai-models-status').textContent=e.message;$('ai-models-status').className='admin-status error';throw e}finally{sectionLoading('admin-ai-models-section',false)}}
  async function saveAiModels(){const button=$('save-ai-models');const rows=[...document.querySelectorAll('.ai-model-admin-row')];const models=rows.map(row=>({value:row.querySelector('.ai-model-enabled').dataset.modelValue,enabled:row.querySelector('.ai-model-enabled').checked,badge:row.querySelector('.ai-model-badge-input').value.trim()}));if(!models.some(model=>model.enabled)){$('ai-models-status').textContent='최소 한 개 이상의 모델을 공개해야 합니다.';$('ai-models-status').className='admin-status error';return}button.disabled=true;try{const data=await api('/api/admin/ai-models',{method:'PATCH',body:JSON.stringify({models})});aiModels=data.models||models;renderAiModels();$('ai-models-status').textContent=`저장 완료 · 공개 모델 ${aiModels.filter(model=>model.enabled).length}개`;$('ai-models-status').className='admin-status'}catch(e){$('ai-models-status').textContent=e.message;$('ai-models-status').className='admin-status error'}finally{button.disabled=false}}
  function renderBillingSettings(){
    const payment=$('admin-payment-enabled'),donation=$('admin-donation-enabled'),donationUrl=$('admin-donation-url');
    payment.checked=Boolean(billingSettings.payment_enabled);donation.checked=Boolean(billingSettings.donation_enabled);
    donationUrl.value=String(billingSettings.donation_url||'');donationUrl.required=donation.checked;
    [['admin-payment-state',payment.checked],['admin-donation-state',donation.checked]].forEach(([id,enabled])=>{const badge=$(id);badge.textContent=enabled?'사용':'미사용';badge.className=enabled?'ready':'missing'});
  }
  function normalizeExternalHttpUrl(value){const raw=String(value||'').trim();if(!raw)return '';try{const url=new URL(raw);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:''}catch(_){return ''}}
  async function loadBillingSettings(force=false){
    if(billingSettingsLoaded&&!force)return {settings:billingSettings};
    if(billingSettingsLoading)return billingSettingsLoading;
    sectionLoading('admin-billing-section',true);$('billing-settings-status').textContent='최신 결제 설정을 불러오는 중입니다.';$('billing-settings-status').className='admin-status';
    billingSettingsLoading=(async()=>{try{const data=await api('/api/admin/billing-settings');billingSettings={payment_enabled:Boolean(data.settings?.payment_enabled),donation_enabled:Boolean(data.settings?.donation_enabled),donation_url:String(data.settings?.donation_url||'')};billingSettingsLoaded=true;renderBillingSettings();$('billing-settings-status').textContent=`현재 결제 설정을 불러왔습니다.${data.updated_at?` · 최종 변경 ${date(data.updated_at)}`:''}`;return data}catch(e){$('billing-settings-status').textContent=e.message;$('billing-settings-status').className='admin-status error';throw e}finally{sectionLoading('admin-billing-section',false);billingSettingsLoading=null}})();
    return billingSettingsLoading;
  }
  async function saveBillingSettings(){
    const button=$('save-billing-settings'),urlInput=$('admin-donation-url'),rawUrl=urlInput.value.trim(),donationUrl=normalizeExternalHttpUrl(rawUrl);const settings={payment_enabled:$('admin-payment-enabled').checked,donation_enabled:$('admin-donation-enabled').checked,donation_url:donationUrl};
    if(rawUrl&&!donationUrl){$('billing-settings-status').textContent='http:// 또는 https://로 시작하는 올바른 후원 URL을 입력해 주세요.';$('billing-settings-status').className='admin-status error';urlInput.focus();return}
    if(settings.donation_enabled&&!donationUrl){$('billing-settings-status').textContent='커피 후원받기를 사용하려면 외부 URL을 등록해 주세요.';$('billing-settings-status').className='admin-status error';urlInput.focus();return}
    button.disabled=true;
    try{const data=await api('/api/admin/billing-settings',{method:'PATCH',body:JSON.stringify(settings)});billingSettings=data.settings||settings;billingSettingsLoaded=true;renderBillingSettings();$('billing-settings-status').textContent=`저장 완료 · 결제 ${billingSettings.payment_enabled?'사용':'미사용'} · 후원 ${billingSettings.donation_enabled?'사용':'미사용'} · 외부 링크 ${billingSettings.donation_url?'등록':'미등록'}`;$('billing-settings-status').className='admin-status'}catch(e){$('billing-settings-status').textContent=e.message;$('billing-settings-status').className='admin-status error'}finally{button.disabled=false}
  }
  function renderPermissions(){const body=$('permission-rows');body.innerHTML=permissionFeatures.map(([key,label,description])=>`<tr><td><strong>${label}</strong><span>${description}</span></td>${permissionRoles.map(role=>{const locked=role==='admin';return `<td><input class="permission-toggle" type="checkbox" data-role="${role}" data-feature="${key}" ${permissionMatrix[role]?.[key]?'checked':''} ${locked?'checked disabled':''} aria-label="${label} ${role}"></td>`}).join('')}</tr>`).join('')}
  async function loadPermissions(force=false){
    if(permissionsLoaded&&!force)return {permissions:permissionMatrix};
    if(permissionsLoading)return permissionsLoading;
    sectionLoading('admin-permissions-section',true);
    $('permission-status').textContent='기능별 최신 권한을 불러오는 중입니다.';
    $('permission-status').className='admin-status';
    permissionsLoading=(async()=>{try{const data=await api('/api/admin/permissions');permissionMatrix=data.permissions||{};permissionsLoaded=true;renderPermissions();$('permission-status').textContent='현재 기능별 권한을 불러왔습니다.';$('permission-status').className='admin-status';return data}catch(e){$('permission-status').textContent=e.message;$('permission-status').className='admin-status error';throw e}finally{sectionLoading('admin-permissions-section',false);permissionsLoading=null}})();
    return permissionsLoading;
  }  async function savePermissions(){const button=$('save-permissions');button.disabled=true;try{for(const role of permissionRoles){const permissions={};document.querySelectorAll(`.permission-toggle[data-role="${role}"]`).forEach(input=>permissions[input.dataset.feature]=input.checked);const result=await api('/api/admin/permissions',{method:'PATCH',body:JSON.stringify({role,permissions})});permissionMatrix[role]=result.permissions}$('permission-status').textContent='기능별 권한을 저장했습니다.';$('permission-status').className='admin-status';renderPermissions()}catch(e){$('permission-status').textContent=e.message;$('permission-status').className='admin-status error'}finally{button.disabled=false}}
  async function loadSummary(){sectionLoading('admin-summary-section',true);try{const data=await api('/api/admin/summary');const summary=data.summary||{};$('summary-total').textContent=Number(summary.total||0).toLocaleString();$('summary-admin').textContent=Number(summary.admins||0).toLocaleString();$('summary-inactive').textContent=Number(summary.inactive||0).toLocaleString();return data}finally{sectionLoading('admin-summary-section',false)}}
  async function load(){sectionLoading('admin-members-section',true);status('회원 정보를 불러오는 중입니다.');try{const q=$('search-query').value.trim();const data=await api(`/api/admin/users?q=${encodeURIComponent(q)}`);$('member-rows').innerHTML=data.users.length?data.users.map(row).join(''):'<tr><td colspan="7" class="empty">검색된 회원이 없습니다.</td></tr>';$('summary-visible').textContent=Number(data.users.length).toLocaleString();status(`회원 ${data.total}명을 조회했습니다.`);return data}catch(e){status(`${e.message} 메인 페이지에서 다시 로그인해 주세요.`,'error');throw e}finally{sectionLoading('admin-members-section',false)}}
  document.addEventListener('DOMContentLoaded',async()=>{progress(8,'관리자 권한 확인 중');try{const session=await api('/api/auth/session');if(!session.authenticated||session.user.role!=='admin'){throw new Error('관리자 로그인이 확인되지 않았습니다.')}currentAdmin=session.user;$('admin-identity').textContent=`${currentAdmin.nickname} · 관리자`;progress(25,'관리자 확인 완료');const tasks=[{run:async()=>{try{const ui=await api('/api/auth/preferences/ui');if(ui.preference)applyUiPreference(ui.preference)}catch(_){}},label:'화면 설정 적용 중'},{run:loadSummary,label:'회원 요약 불러오는 중'},{run:load,label:'회원 목록 불러오는 중'},{run:loadAiRouting,label:'AI API 연결 방식 불러오는 중'},{run:loadNewsSearch,label:'뉴스 검색 방식 불러오는 중'},{run:loadAiModels,label:'AI 모델 공개 설정 불러오는 중'}];let completed=0;await Promise.allSettled(tasks.map(async task=>{try{return await task.run()}finally{completed+=1;progress(25+Math.round(completed/tasks.length*75),task.label)}}));progress(100,'관리자 페이지 준비 완료')}catch(error){$('admin-identity').textContent='접근 권한 없음';status(`${error.message} 메인 페이지에서 관리자 계정으로 다시 로그인해 주세요.`,'error');$('member-rows').innerHTML='<tr><td colspan="7" class="empty"><a href="/">메인 페이지로 돌아가기</a></td></tr>';sectionLoading('admin-summary-section',false);sectionLoading('admin-members-section',false);sectionLoading('admin-service-plans-section',false);sectionLoading('admin-permissions-section',false);sectionLoading('admin-billing-section',false);sectionLoading('admin-ai-routing-section',false);sectionLoading('admin-news-search-section',false);sectionLoading('admin-ai-models-section',false);progress(100,'접근 권한을 확인하지 못했습니다.');return}
    $('member-search').addEventListener('submit',e=>{e.preventDefault();load()});$('refresh-members').addEventListener('click',load);
        const permissionDetails=$('admin-permissions-details');
    permissionDetails.addEventListener('toggle',()=>{if(permissionDetails.open&&!permissionsLoaded)loadPermissions().catch(()=>{});});
    if(permissionDetails.open&&!permissionsLoaded)loadPermissions().catch(()=>{});
    const servicePlanDetails=$('admin-service-plans-details');
    servicePlanDetails.addEventListener('toggle',()=>{if(servicePlanDetails.open&&!servicePlansLoaded)loadServicePlans().catch(()=>{});});
    if(servicePlanDetails.open&&!servicePlansLoaded)loadServicePlans().catch(()=>{});
    const billingDetails=$('admin-billing-details');
    billingDetails.addEventListener('toggle',()=>{if(billingDetails.open&&!billingSettingsLoaded)loadBillingSettings().catch(()=>{});});
    if(billingDetails.open&&!billingSettingsLoaded)loadBillingSettings().catch(()=>{});
    $('save-service-plans').addEventListener('click',saveServicePlans);
    $('save-permissions').addEventListener('click',savePermissions);
    $('save-billing-settings').addEventListener('click',saveBillingSettings);
    $('admin-payment-enabled').addEventListener('change',()=>{billingSettings.payment_enabled=$('admin-payment-enabled').checked;renderBillingSettings()});
    $('admin-donation-enabled').addEventListener('change',()=>{billingSettings.donation_enabled=$('admin-donation-enabled').checked;renderBillingSettings()});
    $('admin-donation-url').addEventListener('input',event=>{billingSettings.donation_url=event.target.value.trim()});
    $('save-ai-routing').addEventListener('click',saveAiRouting);
    $('save-news-search').addEventListener('click',saveNewsSearch);
    $('save-ai-models').addEventListener('click',saveAiModels);
    $('member-rows').addEventListener('click',async event=>{
      const summaryRow=event.target.closest('.member-summary-row');if(!summaryRow)return;
      const button=event.target.closest('button');
      if(!button){if(!event.target.closest('input,select,a,label'))await toggleMemberDetail(summaryRow);return}
      const id=summaryRow.dataset.id;if(!id)return;summaryRow.classList.add('saving');
      try{
        if(button.classList.contains('save')){
          await api(`/api/admin/users/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({role:summaryRow.querySelector('.role').value,plan_code:summaryRow.querySelector('.plan').value,status:summaryRow.querySelector('.state').value})});
          status('회원 권한을 저장했습니다.');await Promise.all([load(),loadSummary()]);
        }else if(button.classList.contains('credit-save')){
          const input=summaryRow.querySelector('.credit-input');const balance=Number(input.value);
          const result=await api(`/api/admin/users/${encodeURIComponent(id)}/credits`,{method:'PATCH',body:JSON.stringify({balance,reason:'관리자 페이지 잔여 건수 직접 설정'})});
          input.value=String(result.balance);status(result.message);
          const detailRow=document.querySelector(`.member-detail-row[data-detail-for="${CSS.escape(id)}"]`);if(detailRow&&!detailRow.hidden)await loadMemberDetail(id,detailRow,true);
        }
      }catch(error){status(error.message,'error')}finally{summaryRow.classList.remove('saving')}
    });
    $('member-rows').addEventListener('keydown',async event=>{if((event.key==='Enter'||event.key===' ')&&event.target.classList.contains('member-summary-row')){event.preventDefault();await toggleMemberDetail(event.target)}});
  });
})();
