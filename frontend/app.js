// ─── Config ───────────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:8000'; // dev
// const API_BASE = 'https://api.oasaka.xyz'; // production

// Demo wallet — Hardhat default test key, publicly known, no real assets
const DEMO_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const DEMO_CLIENT_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const DEMO_PAY_TO_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: 8453,
  verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};
const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from',        type: 'address' },
    { name: 'to',          type: 'address' },
    { name: 'value',       type: 'uint256' },
    { name: 'validAfter',  type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce',       type: 'bytes32' },
  ],
};

// ─── State ────────────────────────────────────────────────────────────────────
let currentStep = 1;
let paymentRequirement = null;
let lastPayload = null;        // saved so replay attack can reuse it
let lastXPayment = null;

// ─── DOM helpers ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function addCard(columnId, title, content, cssClass = '') {
  const col = $(`${columnId}-messages`);
  const card = document.createElement('div');
  card.className = `terminal-card ${cssClass}`;
  card.innerHTML = `
    <div class="terminal-titlebar">
      <div class="dot dot-red"></div>
      <div class="dot dot-yellow"></div>
      <div class="dot dot-green"></div>
      <span class="terminal-title">${title}</span>
    </div>
    <div class="terminal-body">${content}</div>`;
  col.appendChild(card);
  col.scrollTop = col.scrollHeight;
  return card;
}

function addAnnotation(columnId, html) {
  const col = $(`${columnId}-messages`);
  const bubble = document.createElement('div');
  bubble.className = 'annotation';
  bubble.innerHTML = html;
  col.appendChild(bubble);
}

function addCheckItem(columnId, name, passed, delay = 0) {
  const col = $(`${columnId}-messages`);
  return new Promise(resolve => {
    setTimeout(() => {
      const item = document.createElement('div');
      item.className = `check-item`;
      item.style.animationDelay = '0ms';
      item.innerHTML = `
        <span class="${passed ? 'check-pass' : 'check-fail'}">${passed ? '✓' : '✗'}</span>
        <span>${name}</span>`;
      col.appendChild(item);
      col.scrollTop = col.scrollHeight;
      resolve();
    }, delay);
  });
}

function hl(cls, text) {
  return `<span class="hl-${cls}">${escHtml(text)}</span>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function hlJson(obj, indent = 2) {
  return JSON.stringify(obj, null, indent)
    .replace(/"([^"]+)":/g, (_, k) => `${hl('key', `"${k}"`)}:`)
    .replace(/: "([^"]*)"/g, (_, v) => `: ${hl('str', `"${v}"`)}`)
    .replace(/: (\d+)/g, (_, v) => `: ${hl('num', v)}`)
    .replace(/: (true|false)/g, (_, v) => `: ${hl('bool', v)}`);
}

function setStepUI(step) {
  $('step-label').textContent = `Step ${step} of 7`;
  document.querySelectorAll('.step-dot').forEach(dot => {
    const n = parseInt(dot.dataset.step);
    dot.classList.remove('done', 'active');
    if (n < step)  dot.classList.add('done');
    if (n === step) dot.classList.add('active');
  });
}

function setNextBtn(label, disabled = false) {
  const btn = $('next-btn');
  btn.textContent = label;
  btn.disabled = disabled;
}

// ─── Step descriptions ────────────────────────────────────────────────────────
const STEP_DESCS = {
  1: 'Send a request to the weather API without any payment header.',
  2: 'The server responds with 402 Payment Required and tells us what it needs.',
  3: 'Build an EIP-3009 TransferWithAuthorization signature in the browser.',
  4: 'Re-send the request with the signed payment in the X-PAYMENT header.',
  5: 'The server forwards the payment to the Facilitator for verification.',
  6: 'The Facilitator runs 6 checks on the payment payload.',
  7: 'All checks passed — the server returns the weather data.',
};

// ─── Step 1: Send unauthenticated request ─────────────────────────────────────
async function runStep1() {
  setNextBtn('Running…', true);

  // Show outgoing request card
  addCard('client', 'HTTP Request', `\
${hl('method', 'GET')} ${hl('path', '/api/server/weather')} ${hl('version', 'HTTP/1.1')}
${hl('header-name', 'Host')}: ${hl('header-val', 'api.oasaka.xyz')}
${hl('header-name', 'Accept')}: ${hl('header-val', 'application/json')}`);

  const resp = await fetch(`${API_BASE}/api/server/weather`);
  const data = await resp.json();

  if (resp.status === 402) {
    paymentRequirement = data;
    addCard('server', `HTTP ${resp.status}`, `\
${hl('version', 'HTTP/1.1')} ${hl('status-402', '402 Payment Required')}
${hl('header-name', 'Content-Type')}: ${hl('header-val', 'application/json')}
${hl('header-name', 'X-402-Version')}: ${hl('header-val', '1')}

${hlJson(data)}`);

    setStepUI(2);
    currentStep = 2;
    $('step-desc').textContent = STEP_DESCS[2];
    setNextBtn('Next: Inspect Response →');
  }
}

// ─── Step 2: Annotate the 402 response ───────────────────────────────────────
function runStep2() {
  const acc = paymentRequirement.accepts[0];

  addAnnotation('server', `
    <strong>x402Version</strong> — 协议版本号，目前为 1。<br>
    <strong>scheme: "exact"</strong> — 要求精确金额支付（不多不少）。<br>
    <strong>network: "eip155:8453"</strong> — Base 主网 (Chain ID 8453)，使用 EIP-155 格式。<br>
    <strong>maxAmountRequired: "${acc.maxAmountRequired}"</strong> — 需要支付 ${acc.maxAmountRequired} USDC 最小单位（$0.01），USDC 有 6 位小数。<br>
    <strong>asset</strong> — USDC 合约地址（Base 主网）。<br>
    <strong>payTo</strong> — 商家收款地址，签名时 <code>to</code> 字段必须等于此值。<br>
    <strong>maxTimeoutSeconds: 300</strong> — 签名有效期最多 5 分钟。
  `);

  setStepUI(3);
  currentStep = 3;
  $('step-desc').textContent = STEP_DESCS[3];
  setNextBtn('Next: Sign Payment →');
}

// ─── Step runner ─────────────────────────────────────────────────────────────
$('next-btn').addEventListener('click', async () => {
  try {
    if (currentStep === 1) await runStep1();
    else if (currentStep === 2) runStep2();
    else if (currentStep === 3) await runStep3();
    else if (currentStep === 4) await runStep4();
    else if (currentStep === 5) runStep5();
    else if (currentStep === 6) await runStep6();
    else if (currentStep === 7) runStep7done();
  } catch (err) {
    console.error(err);
    addAnnotation('client', `<strong style="color:var(--red)">Error:</strong> ${escHtml(err.message)}`);
    setNextBtn('Retry →', false);
  }
});

// ─── Step 3: Build EIP-3009 signature ────────────────────────────────────────
async function runStep3() {
  setNextBtn('Signing…', true);

  const now = Math.floor(Date.now() / 1000);
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const amount = BigInt(paymentRequirement.accepts[0].maxAmountRequired);

  const message = {
    from:        DEMO_CLIENT_ADDRESS,
    to:          DEMO_PAY_TO_ADDRESS,
    value:       amount,
    validAfter:  BigInt(now - 10),
    validBefore: BigInt(now + 300),
    nonce:       nonce,
  };

  const wallet = new ethers.Wallet(DEMO_PRIVATE_KEY);
  const signature = await wallet.signTypedData(DOMAIN, EIP3009_TYPES, message);

  lastPayload = {
    from:        DEMO_CLIENT_ADDRESS,
    to:          DEMO_PAY_TO_ADDRESS,
    value:       String(amount),
    validAfter:  String(now - 10),
    validBefore: String(now + 300),
    nonce:       nonce,
    signature:   signature,
  };
  lastXPayment = btoa(JSON.stringify(lastPayload));

  // Show fields appearing one by one
  const fields = [
    ['from',        DEMO_CLIENT_ADDRESS],
    ['to',          DEMO_PAY_TO_ADDRESS],
    ['value',       String(amount)],
    ['validAfter',  String(now - 10)],
    ['validBefore', String(now + 300)],
    ['nonce',       nonce],
    ['signature',   signature],
  ];

  const col = $('client-messages');
  const card = document.createElement('div');
  card.className = 'terminal-card';
  card.innerHTML = `
    <div class="terminal-titlebar">
      <div class="dot dot-red"></div><div class="dot dot-yellow"></div><div class="dot dot-green"></div>
      <span class="terminal-title">EIP-3009 Payload</span>
    </div>
    <div class="terminal-body" id="payload-body">{</div>`;
  col.appendChild(card);

  const body = card.querySelector('#payload-body');
  for (let i = 0; i < fields.length; i++) {
    await new Promise(r => setTimeout(r, 200));
    const [k, v] = fields[i];
    const comma = i < fields.length - 1 ? ',' : '';
    body.innerHTML += `\n  ${hl('key', `"${k}"`)}: ${hl('str', `"${escHtml(v)}"` )}${comma}`;
  }
  await new Promise(r => setTimeout(r, 200));
  body.innerHTML += '\n}';

  addAnnotation('client', `
    <strong>EIP-3009 TransferWithAuthorization</strong> — 链下授权转账标准。<br>
    <strong>validAfter / validBefore</strong> — 签名时间窗口，防止无限期有效的授权。<br>
    <strong>nonce</strong> — 随机 32 字节，每次签名唯一，防止重放攻击。<br>
    <strong>signature</strong> — EIP-712 结构化数据签名，由客户端私钥生成。<br>
    整个 payload 将 Base64 编码后放入 <code>X-PAYMENT</code> 请求头。
  `);

  setStepUI(4);
  currentStep = 4;
  $('step-desc').textContent = STEP_DESCS[4];
  setNextBtn('Next: Send Payment →');
}

// ─── Step 4: Re-request with X-PAYMENT header ────────────────────────────────
async function runStep4() {
  setNextBtn('Sending…', true);

  addCard('client', 'HTTP Request (with payment)', `\
${hl('method', 'GET')} ${hl('path', '/api/server/weather')} ${hl('version', 'HTTP/1.1')}
${hl('header-name', 'Host')}: ${hl('header-val', 'api.oasaka.xyz')}
${hl('header-name', 'Accept')}: ${hl('header-val', 'application/json')}
${hl('header-name', 'X-PAYMENT')}: ${hl('header-val', lastXPayment.slice(0, 40) + '…')}`);

  addAnnotation('client', `
    <strong>X-PAYMENT</strong> — x402 协议定义的请求头，值为上一步 payload 的 Base64 编码。<br>
    服务器收到后会解码，提取支付信息，并调用 Facilitator 做签名验证。
  `);

  const resp = await fetch(`${API_BASE}/api/server/weather`, {
    headers: { 'X-PAYMENT': lastXPayment },
  });
  const data = await resp.json();

  if (resp.status === 200) {
    // Save response data for step 7
    window._weatherData = data;
    window._receiptHeader = resp.headers.get('X-Payment-Receipt') || 'receipt-' + Date.now();
  }

  setStepUI(5);
  currentStep = 5;
  $('step-desc').textContent = STEP_DESCS[5];
  setNextBtn('Next: See Verification →');
}
// ─── Step 5: Show server→facilitator internal call ───────────────────────────
function runStep5() {
  addCard('server', 'Internal: Server → Facilitator', `\
${hl('method', 'POST')} ${hl('path', '/api/facilitator/verify')} ${hl('version', 'HTTP/1.1')}
${hl('header-name', 'Content-Type')}: ${hl('header-val', 'application/json')}

${hlJson({
  from: lastPayload.from,
  to: lastPayload.to,
  value: lastPayload.value,
  validAfter: lastPayload.validAfter,
  validBefore: lastPayload.validBefore,
  nonce: lastPayload.nonce.slice(0, 18) + '…',
  signature: lastPayload.signature.slice(0, 18) + '…',
})}`);

  addAnnotation('server', `
    <strong>Server 不自己验签</strong> — 它把解码后的 payload 转发给 Facilitator，<br>
    由 Facilitator 执行 6 条验证，返回 <code>{"valid": true/false}</code>。<br>
    这种设计让验证逻辑可以独立部署、单独扩展。
  `);

  setStepUI(6);
  currentStep = 6;
  $('step-desc').textContent = STEP_DESCS[6];
  setNextBtn('Next: Run Checks →');
}

// ─── Step 6: Show facilitator verification checks ────────────────────────────
async function runStep6() {
  setNextBtn('Verifying…', true);

  // Call facilitator directly so we get the checks array
  const resp = await fetch(`${API_BASE}/api/facilitator/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lastPayload),
  });
  const result = await resp.json();

  for (let i = 0; i < result.checks.length; i++) {
    await addCheckItem('facilitator', result.checks[i].name, result.checks[i].passed, i * 250);
  }

  await new Promise(r => setTimeout(r, result.checks.length * 250 + 100));

  addAnnotation('facilitator', `
    <strong>6 条验证全部通过</strong><br>
    ① 字段完整性 ② 时效性 ③ 金额 ④ 收款地址 ⑤ EIP-712 签名 ⑥ Nonce 去重<br>
    Nonce 记录后即失效，同一 nonce 无法二次使用。
  `);

  setStepUI(7);
  currentStep = 7;
  $('step-desc').textContent = STEP_DESCS[7];
  setNextBtn('Next: Get Weather Data →');
}

// ─── Step 7: Show final 200 response ─────────────────────────────────────────
function runStep7done() {
  const data = window._weatherData || {
    city: 'Hangzhou', temperature: 22, condition: 'Partly cloudy',
    paid_with: '0.01 USDC', message: 'Payment verified. Thank you!',
  };
  const receipt = window._receiptHeader || 'receipt-demo';

  const card = addCard('server', 'HTTP 200 OK ✓', `\
${hl('version', 'HTTP/1.1')} ${hl('status-200', '200 OK')}
${hl('header-name', 'Content-Type')}: ${hl('header-val', 'application/json')}
${hl('header-name', 'X-Payment-Receipt')}: ${hl('header-val', receipt.slice(0, 20) + '…')}

${hlJson(data)}`);
  card.classList.add('success-pulse');

  addAnnotation('server', `
    <strong>X-Payment-Receipt</strong> — 服务器签发的收据 token，客户端可用于对账。<br>
    整个握手完成：Client 支付 → Server 验证 → Facilitator 确认 → Server 放行数据。<br>
    <strong>这就是 x402 协议的完整流程。</strong>
  `);

  // Mark all steps done
  document.querySelectorAll('.step-dot').forEach(dot => {
    dot.classList.remove('active');
    dot.classList.add('done');
  });

  $('step-label').textContent = 'Complete!';
  $('step-desc').textContent = '🎉 All 7 steps done. Want to try a replay attack?';
  $('next-btn').classList.add('hidden');
  $('replay-btn').classList.remove('hidden');
  $('reset-btn').classList.remove('hidden');

  currentStep = 8;
}

// ─── Replay attack ────────────────────────────────────────────────────────────
$('replay-btn').addEventListener('click', async () => {
  $('replay-btn').disabled = true;
  $('replay-btn').textContent = 'Replaying…';

  // Reuse the same payload (same nonce)
  const resp = await fetch(`${API_BASE}/api/facilitator/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lastPayload),
  });
  const result = await resp.json();

  addCard('facilitator', '⚠ Replay Attempt', `\
${hl('status-402', 'REJECTED')}

${hlJson(result)}`);

  addAnnotation('facilitator', `
    <strong>防重放攻击成功拦截！</strong><br>
    Facilitator 记录了已使用的 nonce，相同 nonce 的二次提交直接拒绝。<br>
    攻击者截获 X-PAYMENT 报文后无法重放使用。
  `);

  $('replay-btn').textContent = '⚠ Try Replay Attack';
  $('replay-btn').disabled = false;
});

// ─── Reset ────────────────────────────────────────────────────────────────────
$('reset-btn').addEventListener('click', async () => {
  await fetch(`${API_BASE}/api/demo/reset`);
  location.reload();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
setStepUI(1);
$('step-desc').textContent = STEP_DESCS[1];
