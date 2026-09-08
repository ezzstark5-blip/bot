import { questConfig } from './questConfig.js';

export const TASK_TYPES = {
  WATCH_VIDEO: '🎬 Vídeo',
  WATCH_VIDEO_ON_MOBILE: '🎬 Vídeo',
  PLAY_ON_DESKTOP: '🎮 Jogar',
  PLAY_ON_XBOX: '🎮 Jogar',
  PLAY_ON_PLAYSTATION: '🎮 Jogar',
};

const TASK_PRIORITY = [
  'PLAY_ON_DESKTOP',
  'PLAY_ON_XBOX',
  'PLAY_ON_PLAYSTATION',
  'WATCH_VIDEO',
  'WATCH_VIDEO_ON_MOBILE',
];

/** Mantido só por compat — não usa mais token global. */
export function setActiveToken(_token) {
  /* no-op: cada farm passa o token por chamada */
}

export function jitter(base, range = 1500) {
  return base + Math.floor(Math.random() * range);
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function formatTime(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function getTaskDuration(target) {
  if (target >= 60) {
    const m = Math.floor(target / 60);
    const s = target % 60;
    return s > 0 ? `${m}min ${s}s` : `${m} minutos`;
  }
  return `${Math.floor(target)} segundos`;
}

function parseRewardText(r) {
  if (!r) return 'Recompensa desconhecida';
  if (r.type === 4) return `${r.orb_quantity} Orbs`;
  if (r.type === 3) return r.messages?.name || 'Decoração';
  if (r.type === 1) return r.messages?.name || 'Item';
  return 'Recompensa';
}

function getBestTask(tasks) {
  let selected = null;
  let best = 999;
  for (const [type, data] of Object.entries(tasks)) {
    if (!TASK_TYPES[type]) continue;
    const p = TASK_PRIORITY.indexOf(type);
    if (p !== -1 && p < best) {
      best = p;
      selected = { taskType: type, taskData: data };
    }
  }
  return selected;
}

export function createProgressBar(current, total, size = 14) {
  const safeTotal = Math.max(total || 1, 1);
  const pct = Math.min(Math.floor((current / safeTotal) * 100), 100);
  const filled = Math.round((pct / 100) * size);
  const empty = size - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${pct}%`;
}

function assertAuthOk(status, context) {
  if (status === 401 || status === 403) {
    throw new Error(`Token inválido/expirado durante ${context} (HTTP ${status}).`);
  }
}

async function makeRequest(token, endpoint, method, body = null) {
  try {
    const headers = {
      authorization: token,
      'x-super-properties': questConfig.xSuperProperties,
      'user-agent': questConfig.userAgent,
      'accept-language': 'pt-BR,pt;q=0.9',
      'sec-ch-ua': '"Chromium";v="138", "Not=A?Brand";v="8"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      origin: 'https://discord.com',
      referer: 'https://discord.com/channels/@me',
    };
    if (body) headers['content-type'] = 'application/json';

    const res = await fetch(`https://discord.com/api/v9${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    return { status: res.status, data };
  } catch {
    return { status: 500, data: null };
  }
}

export async function getUserInfo(token) {
  const res = await makeRequest(token, '/users/@me', 'GET');
  if (res.status !== 200) return null;
  return res.data;
}

export async function getOrbsBalance(token) {
  const res = await makeRequest(token, '/users/@me/virtual-currency/balance', 'GET');
  if (res.status !== 200) return null;
  return res.data.balance || 0;
}

export async function fetchAvailableQuests(token) {
  const res = await makeRequest(token, '/quests/@me', 'GET');
  if (res.status !== 200 || !res.data?.quests) return [];

  const now = new Date();
  const result = [];
  for (const quest of res.data.quests) {
    if (new Date(quest.config.expires_at) < now) continue;
    if (quest.user_status?.completed_at) continue;

    const tasks = quest.config.task_config_v2?.tasks || {};
    const selected = getBestTask(tasks);
    if (!selected) continue;

    const target = selected.taskData.target || 0;
    const rewardText = parseRewardText(quest.config.rewards_config?.rewards?.[0]);
    result.push({
      questId: quest.id,
      questName: quest.config.messages.quest_name,
      taskType: selected.taskType,
      target,
      rewardText,
      isEnrolled: !!quest.user_status?.enrolled_at,
    });
  }

  result.sort((a, b) => {
    const aOrbs = a.rewardText.includes('Orbs');
    const bOrbs = b.rewardText.includes('Orbs');
    if (aOrbs && !bOrbs) return -1;
    if (!aOrbs && bOrbs) return 1;
    return a.target - b.target;
  });

  return result;
}

async function runQuest(token, quest, { onLog, onProgress } = {}) {
  const { questId, taskType, target } = quest;
  let currentProgress = 0;
  const log = (msg) => {
    console.log(msg);
    onLog?.(msg);
  };
  const emitProgress = (value) => {
    currentProgress = value;
    try {
      onProgress?.(currentProgress, target);
    } catch {
      /* UI não pode derrubar o farm */
    }
  };

  log(`\n🚀 Iniciando: ${quest.questName}`);
  log(`   Tipo: ${TASK_TYPES[taskType] || taskType} | Duração: ${getTaskDuration(target)} | Recompensa: ${quest.rewardText}\n`);
  emitProgress(0);

  if (!quest.isEnrolled) {
    const enroll = await makeRequest(token, `/quests/${questId}/enroll`, 'POST', {
      location: 11,
      is_targeted: false,
      metadata_raw: null,
    });
    assertAuthOk(enroll.status, 'inscrição');
    if (enroll.status !== 200) {
      log(`   ❌ Falha ao se inscrever (status ${enroll.status})`);
      return false;
    }
    log('   ✅ Inscrito na missão');
  }

  if (taskType.startsWith('WATCH_')) {
    let timestamp = 0;
    let errorStreak = 0;
    const MAX_ERRORS = 12;

    while (currentProgress < target) {
      const res = await makeRequest(token, `/quests/${questId}/video-progress`, 'POST', { timestamp });
      assertAuthOk(res.status, 'vídeo');

      if (res.status === 400 || res.status === 429) {
        timestamp = Math.max(0, timestamp - 10);
        await sleep(jitter(8000));
        continue;
      }

      if (res.status === 200) {
        errorStreak = 0;
        if (res.data?.completed_at) {
          emitProgress(target);
          break;
        }
        timestamp += 10;
        emitProgress(Math.min(timestamp, target));
        const p = `   ${createProgressBar(currentProgress, target)} | ${formatTime(currentProgress)} / ${formatTime(target)}`;
        process.stdout.write(`\r${p}`);
        onLog?.(p);
        if (currentProgress >= target) break;
      } else {
        errorStreak++;
        log(`   ⚠️ Progresso vídeo HTTP ${res.status} (tentativa ${errorStreak}/${MAX_ERRORS})`);
        if (errorStreak >= MAX_ERRORS) {
          log('   ❌ Missão de vídeo travou demais — pulando.');
          return false;
        }
        await sleep(jitter(5000, 3000));
        continue;
      }
      await sleep(jitter(2500, 2500));
    }
  } else if (taskType.startsWith('PLAY_')) {
    const streamKey = `call:${questId}:1`;
    const MAX_STUCK = 8;
    const MAX_ERRORS = 12;
    let stuckCounter = 0;
    let errorStreak = 0;

    while (currentProgress < target) {
      const res = await makeRequest(token, `/quests/${questId}/heartbeat`, 'POST', {
        stream_key: streamKey,
        terminal: false,
      });
      assertAuthOk(res.status, 'heartbeat');

      if (res.status === 429) {
        await sleep(jitter(8000));
        continue;
      }

      if (res.status === 200) {
        errorStreak = 0;
        const data = res.data;
        if (data?.completed_at || data?.user_status?.completed_at) {
          emitProgress(target);
          break;
        }
        const newProgress = data?.progress?.[taskType]?.value ?? currentProgress;
        if (newProgress > currentProgress) {
          stuckCounter = 0;
          emitProgress(newProgress);
          const p = `   ${createProgressBar(currentProgress, target)} | ${formatTime(currentProgress)} / ${formatTime(target)}`;
          process.stdout.write(`\r${p}`);
          onLog?.(p);
          if (currentProgress >= target) {
            await makeRequest(token, `/quests/${questId}/heartbeat`, 'POST', {
              stream_key: streamKey,
              terminal: true,
            });
            emitProgress(target);
            break;
          }
        } else {
          stuckCounter++;
          if (stuckCounter >= MAX_STUCK) {
            // Não marca como sucesso falso — tenta terminal e falha a missão
            await makeRequest(token, `/quests/${questId}/heartbeat`, 'POST', {
              stream_key: streamKey,
              terminal: true,
            });
            log('   ❌ Heartbeat sem progresso — missão falhou (não falsa conclusão).');
            return false;
          }
        }
      } else {
        errorStreak++;
        stuckCounter++;
        log(`   ⚠️ Heartbeat HTTP ${res.status} (erro ${errorStreak}/${MAX_ERRORS})`);
        if (errorStreak >= MAX_ERRORS || stuckCounter >= MAX_STUCK + 4) {
          log('   ❌ Missão de jogo travou demais — pulando.');
          return false;
        }
        await sleep(jitter(8000, 4000));
        continue;
      }
      await sleep(jitter(24000, 3000));
    }
  }

  emitProgress(target);
  const done = `   ✅ Missão concluída! Recompensa: ${quest.rewardText}\n`;
  process.stdout.write(`\r   ${createProgressBar(target, target)} | ${formatTime(target)} / ${formatTime(target)}\n`);
  log(done);
  return true;
}

/**
 * @param {string} userToken
 * @param {{ onLog?: (msg: string) => void, onProgress?: (payload: object) => void | Promise<void> }} [hooks]
 */
export async function runAutoQuest(userToken, hooks = {}) {
  const onLog = typeof hooks === 'function' ? hooks : hooks.onLog;
  const onProgress = typeof hooks === 'function' ? undefined : hooks.onProgress;

  const token = String(userToken || '').trim();
  if (!token) throw new Error('Token não fornecido.');

  const log = (msg) => {
    console.log(msg);
    onLog?.(msg);
  };

  log('🔍 Validando token...');
  const user = await getUserInfo(token);
  if (!user) throw new Error('Token inválido ou expirado.');
  log(`👤 Conta: ${user.global_name || user.username} (@${user.username})`);
  log(`🆔 ID: ${user.id}`);

  const orbs = await getOrbsBalance(token);
  if (orbs !== null) log(`💰 Orbs: ${orbs.toLocaleString('pt-BR')}`);

  log('\n📋 Buscando missões disponíveis...\n');
  const quests = await fetchAvailableQuests(token);
  if (!quests.length) {
    log('🚫 Nenhuma missão disponível.');
    await onProgress?.({ type: 'empty', user, orbs });
    return { completed: 0, total: 0, states: [] };
  }

  const states = quests.map((q) => ({
    questId: q.questId,
    questName: q.questName,
    taskType: q.taskType,
    target: q.target,
    rewardText: q.rewardText,
    current: 0,
    status: 'pending',
  }));

  log(`🎯 ${quests.length} missão(ões) encontrada(s):\n`);
  for (let i = 0; i < quests.length; i++) {
    const q = quests[i];
    log(`   ${i + 1}. ${q.questName}`);
    log(`      ${TASK_TYPES[q.taskType]} | ${getTaskDuration(q.target)} | 🎁 ${q.rewardText}`);
  }

  await onProgress?.({ type: 'init', user, orbs, states });

  log('\n▶️ Iniciando execução automática...\n');
  let completed = 0;
  for (const quest of quests) {
    const state = states.find((s) => s.questId === quest.questId);
    state.status = 'running';
    await onProgress?.({ type: 'update', user, orbs, states, force: true });

    let ok = false;
    try {
      ok = await runQuest(token, quest, {
        onLog,
        onProgress: (current, target) => {
          state.current = current;
          state.target = target;
          // Não await — UI não pode travar o heartbeat
          void Promise.resolve(
            onProgress?.({ type: 'update', user, orbs, states })
          ).catch(() => null);
        },
      });
    } catch (err) {
      // Token morto: aborta o farm inteiro
      if (String(err.message || '').includes('Token inválido')) throw err;
      log(`   ❌ Erro na missão: ${err.message}`);
      ok = false;
    }

    state.status = ok ? 'done' : 'failed';
    state.current = ok ? quest.target : state.current;
    if (ok) completed++;
    await onProgress?.({ type: 'update', user, orbs, states, force: true });

    if (quest !== quests[quests.length - 1]) {
      log('⏳ Aguardando antes da próxima missão...\n');
      await sleep(jitter(10000, 3000));
    }
  }

  log(`\n🏁 Tudo pronto! ${completed}/${quests.length} missões concluídas.`);
  const finalOrbs = await getOrbsBalance(token);
  if (finalOrbs !== null) log(`💰 Saldo final de Orbs: ${finalOrbs.toLocaleString('pt-BR')}`);

  await onProgress?.({
    type: 'finished',
    user,
    orbs: finalOrbs ?? orbs,
    states,
    completed,
    total: quests.length,
  });

  return { completed, total: quests.length, states };
}
