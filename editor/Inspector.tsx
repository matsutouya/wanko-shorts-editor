import React, {useRef, useState} from 'react';
import type {PlayerRef} from '@remotion/player';
import {useEditor} from './store';
import {clipDurationSec, placeClips} from '../src/timeline';
import {projectCaptions} from '../src/captions';
import {projectBrolls} from '../src/Broll';
import {IconButton} from './IconButton';
import {HighlightsPanel} from './HighlightsPanel';

type Tab = 'Highlights' | 'Captions' | 'B-roll' | 'Styles' | 'Settings';
const TABS: Tab[] = ['Highlights', 'Captions', 'B-roll', 'Styles', 'Settings'];
const TAB_LABELS: Record<Tab, string> = {Highlights: '見せ場', Captions: '字幕', 'B-roll': '追加映像', Styles: '見た目', Settings: '設定'};
const tabId = (t: Tab) => `inspector-tab-${t.toLowerCase().replace(/[^a-z]/g, '')}`;

const ACCENT_SWATCHES = ['#FFB020', '#c2c1ff', '#ffb785', '#adc6ff', '#39d98a', '#ff6b8b'];

// Right "Inspector" panel: tabbed (Captions / B-roll / Styles / Settings), context-aware.
export const Inspector: React.FC<{
  playerRef: React.RefObject<PlayerRef | null>;
  onGenerate: () => void;
  generating?: boolean;
  progressLabel?: string;
  onGenerateBroll: () => void;
  brollGenerating?: boolean;
  brollLabel?: string;
}> = ({playerRef, onGenerate, generating, progressLabel, onGenerateBroll, brollGenerating, brollLabel}) => {
  const {
    meta, captions, clips, music, brolls, accentColor, selectedId, selectedClipId, currentFrame,
    select, selectClip, setText, setTopPct, toggleAccent, pushHistory, setCaptions, setManualCaptionDuration,
    deleteClip, moveClip, setMusic, setAccentColor, setBrollMode, swapBroll, removeBroll,
    setClipVolume, toggleClipMute, setClipSpeed,
  } = useEditor();
  const [tab, setTab] = useState<Tab>('Highlights');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  if (!meta) return null;

  // WAI-ARIA tabs: ←/→ (Home/End) move between tabs and activate them
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.indexOf(tab);
    let next: Tab | null = null;
    if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
    else if (e.key === 'ArrowLeft') next = TABS[(i - 1 + TABS.length) % TABS.length];
    else if (e.key === 'Home') next = TABS[0];
    else if (e.key === 'End') next = TABS[TABS.length - 1];
    if (!next) return;
    e.preventDefault();
    e.stopPropagation(); // don't move the playhead
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  // captions + b-roll are clip-anchored → project for display (absolute times + order)
  const projCaps = projectCaptions(captions, clips, meta.fps);
  const projBrolls = projectBrolls(brolls, clips, meta.fps);
  const selClip = clips.find((c) => c.id === selectedClipId);
  const seekMs = (ms: number) => playerRef.current?.seekTo(Math.round((ms / 1000) * meta.fps));
  const addManualCaption = () => {
    const playheadMs = (currentFrame / meta.fps) * 1000;
    const placed = placeClips(clips, meta.fps);
    const at = placed.find((p) => playheadMs >= p.startMs && playheadMs < p.endMs) ?? placed.at(-1);
    if (!at) return;
    const speed = at.clip.speed ?? 1;
    const sourceStart = Math.max(at.clip.inSec * 1000, at.clip.inSec * 1000 + (playheadMs - at.startMs) * speed);
    const sourceEnd = Math.min(at.clip.outSec * 1000, sourceStart + 2000 * speed);
    if (sourceEnd <= sourceStart) return;
    const id = `manual-${Date.now()}`;
    pushHistory();
    setCaptions([...captions, {
      id, clipId: at.clip.id, startMs: sourceStart, endMs: sourceEnd, topPct: 72,
      words: [{text: 'ここに文字を入力', startMs: sourceStart, endMs: sourceEnd, accent: false}],
    }]);
    select(id);
    setTab('Captions');
  };

  return (
    <aside aria-label="編集設定" className="w-80 bg-surface-container-high border-l border-outline-variant flex flex-col h-full shrink-0">
      <div className="p-panel-padding pb-0">
        <h2 className="text-headline-md font-headline-md text-on-surface">編集設定</h2>
        <p className="text-body-sm text-on-surface-variant mb-4">選択した素材を調整できます</p>
        <div role="tablist" aria-label="編集設定の項目" onKeyDown={onTabKey} className="flex border-b border-outline-variant">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={tabId(t)}
              aria-selected={tab === t}
              aria-controls={`${tabId(t)}-panel`}
              tabIndex={tab === t ? 0 : -1}
              ref={(el) => { tabRefs.current[t] = el; }}
              onClick={() => setTab(t)}
              className={`flex-1 pb-2 text-[10px] font-label-bold uppercase tracking-wide border-b-2 transition-colors ${
                tab === t ? 'border-primary text-on-primary-container' : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" id={`${tabId(tab)}-panel`} aria-labelledby={tabId(tab)} tabIndex={0} className="flex-1 overflow-y-auto p-panel-padding">
        {tab === 'Highlights' && <HighlightsPanel playerRef={playerRef} />}
        {tab === 'Captions' && (
          <>
            <button type="button" onClick={addManualCaption} disabled={!clips.length} className="w-full py-2 mb-2 rounded-lg border border-primary text-primary font-bold text-body-md hover:bg-primary-container/20 disabled:opacity-40">
              再生位置に文字を追加
            </button>
            <p className="text-[11px] text-on-surface-variant mb-3">犬の映像には、文字を追加して短い一言を入れられます。</p>
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating || !clips.length}
              aria-busy={generating}
              className="w-full py-3 bg-primary-container text-on-primary-container rounded-lg font-bold text-body-md hover:brightness-110 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
            >
              <span aria-hidden="true" className={`material-symbols-outlined text-[20px] ${generating ? 'animate-spin' : ''}`}>{generating ? 'progress_activity' : 'auto_awesome'}</span>
              {generating ? '字幕を作成中…' : '音声から字幕を作る'}
            </button>
            {generating && <p className="text-[11px] text-on-surface-variant mt-2 mb-3 truncate">{progressLabel}</p>}
            <div className="mb-5" />

            {/* selected clip card */}
            {selClip && (
              <section aria-labelledby="clip-card-heading" className="mb-5 p-3 rounded-lg bg-surface-variant/40 border border-primary/30">
                <div className="flex justify-between items-center mb-2">
                  <h3 id="clip-card-heading" className="text-label-bold font-label-bold uppercase text-primary">選択した動画</h3>
                  <div className="flex gap-1">
                    <IconButton icon="chevron_left" label="動画を前に移動" onClick={() => moveClip(selClip.id, -1)} className="text-on-surface-variant hover:text-on-surface" />
                    <IconButton icon="chevron_right" label="動画を後ろに移動" onClick={() => moveClip(selClip.id, 1)} className="text-on-surface-variant hover:text-on-surface" />
                    <IconButton icon="delete" label="この動画を削除" onClick={() => { deleteClip(selClip.id); selectClip(null); }} className="text-on-surface-variant hover:text-error" />
                  </div>
                </div>
                <p className="text-body-sm text-on-surface truncate mb-2">{selClip.label ?? selClip.id}</p>
                <dl>
                  <Row k="開始" v={`${selClip.inSec.toFixed(2)}秒`} />
                  <Row k="終了" v={`${selClip.outSec.toFixed(2)}秒`} />
                  <Row k="長さ" v={`${clipDurationSec(selClip).toFixed(2)}秒`} />
                </dl>

                {/* playback speed */}
                <label htmlFor="clip-speed" className="text-[11px] text-on-surface-variant block mt-3">再生速度: {(selClip.speed ?? 1).toFixed(2)}×</label>
                <div role="group" aria-label="再生速度の候補" className="flex items-center gap-1 mt-1">
                  {[0.5, 1, 1.5, 2].map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      aria-pressed={Math.abs((selClip.speed ?? 1) - sp) < 0.01}
                      onClick={() => { pushHistory(); setClipSpeed(selClip.id, sp); }}
                      className={`flex-1 py-1 text-[11px] rounded border ${
                        Math.abs((selClip.speed ?? 1) - sp) < 0.01 ? 'border-primary text-primary bg-primary-container/20' : 'border-outline-variant/40 text-on-surface-variant'
                      }`}
                    >
                      {sp}×
                    </button>
                  ))}
                </div>
                <input
                  id="clip-speed"
                  type="range" min={25} max={400} step={5} value={Math.round((selClip.speed ?? 1) * 100)}
                  aria-valuetext={`${(selClip.speed ?? 1).toFixed(2)}×`}
                  onPointerDown={pushHistory}
                  onChange={(e) => setClipSpeed(selClip.id, Number(e.target.value) / 100)}
                  className="w-full mt-1 accent-primary"
                />

                {/* clip audio */}
                <div className="flex items-center justify-between mt-3 mb-1">
                  <label htmlFor="clip-volume" className="text-[11px] text-on-surface-variant">
                    音量: {selClip.muted ? 'ミュート' : `${Math.round((selClip.volume ?? 1) * 100)}%`}
                  </label>
                  <IconButton
                    icon={selClip.muted ? 'volume_off' : 'volume_up'}
                    label={selClip.muted ? '音声を戻す' : '音声を消す'}
                    pressed={!!selClip.muted}
                    onClick={() => toggleClipMute(selClip.id)}
                    className={selClip.muted ? 'text-error' : 'text-on-surface-variant hover:text-on-surface'}
                  />
                </div>
                <input
                  id="clip-volume"
                  type="range" min={0} max={200} value={Math.round((selClip.volume ?? 1) * 100)}
                  aria-valuetext={`${Math.round((selClip.volume ?? 1) * 100)}%`}
                  disabled={selClip.muted}
                  onPointerDown={pushHistory}
                  onChange={(e) => setClipVolume(selClip.id, Number(e.target.value) / 100)}
                  className="w-full accent-primary disabled:opacity-40"
                />
                <p className="text-[11px] text-on-surface-variant/75 mt-2">タイムライン上で動画の左右の端をドラッグすると長さを調整できます。</p>
              </section>
            )}

            {/* caption cards */}
            {!captions.length ? (
              <p className="text-body-sm text-on-surface-variant/75">
                字幕はまだありません。犬の映像には、音声字幕を使わずに編集することもできます。
              </p>
            ) : (
              <ul aria-label="字幕" className="space-y-2 list-none m-0 p-0">
                {projCaps.map((c) => {
                  const sel = c.id === selectedId;
                  const text = c.words.map((w) => w.text).join(' ');
                  const pick = () => { select(c.id); seekMs(c.startMs + 20); };
                  return (
                    // the whole card is mouse-clickable; the keyboard target is the
                    // time-range button (a card can't be a button — it holds a textarea)
                    <li
                      key={c.id}
                      onClick={pick}
                      className={`p-3 rounded cursor-pointer transition-colors relative ${
                        sel ? 'bg-surface-variant/40 border-2 border-primary' : 'bg-surface-variant/20 border border-outline-variant/30 hover:border-primary/30'
                      }`}
                    >
                      {sel && <div aria-hidden="true" className="absolute -left-[1px] top-0 bottom-0 w-1 bg-primary rounded-l" />}
                      <div className="flex justify-between items-center mb-1">
                        <button
                          type="button"
                          aria-pressed={sel}
                          aria-label={`字幕 ${(c.startMs / 1000).toFixed(2)}秒から${(c.endMs / 1000).toFixed(2)}秒: ${text}`}
                          onClick={(e) => { e.stopPropagation(); pick(); }}
                          className={`text-[10px] font-mono ${sel ? 'text-primary' : 'text-on-surface-variant'}`}
                        >
                          {(c.startMs / 1000).toFixed(2)}秒 – {(c.endMs / 1000).toFixed(2)}秒
                        </button>
                        <IconButton icon="delete" label="この字幕を削除" onClick={() => { pushHistory(); setCaptions(captions.filter((item) => item.id !== c.id)); }} className="text-on-surface-variant hover:text-error" />
                      </div>

                      {sel ? (
                        <div onClick={(e) => e.stopPropagation()}>
                          <textarea
                            aria-label="字幕の文章"
                            value={text}
                            onFocus={pushHistory}
                            onChange={(e) => setText(c.id, e.target.value)}
                            rows={2}
                            className="w-full mt-1 mb-3 bg-surface-container-lowest text-on-surface border border-outline-variant/40 focus:border-primary rounded p-2 text-body-md resize-y"
                          />
                          {c.id.startsWith('manual-') && (
                            <>
                              <label htmlFor={`caption-duration-${c.id}`} className="text-[11px] text-on-surface-variant">表示時間: {((c.endMs - c.startMs) / 1000).toFixed(1)}秒</label>
                              <input id={`caption-duration-${c.id}`} type="range" min={0.5} max={8} step={0.1} value={Math.min(8, (c.endMs - c.startMs) / 1000)} onPointerDown={pushHistory} onChange={(e) => setManualCaptionDuration(c.id, Number(e.target.value))} className="w-full mt-1 mb-3 accent-primary" />
                            </>
                          )}
                          <label htmlFor="caption-top" className="text-[11px] text-on-surface-variant">上下の位置: {c.topPct}%</label>
                          <input
                            id="caption-top"
                            type="range" min={5} max={88} value={c.topPct}
                            aria-valuetext={`上から${c.topPct}%`}
                            onPointerDown={pushHistory}
                            onChange={(e) => setTopPct(c.id, Number(e.target.value))}
                            className="w-full mt-1 mb-3 accent-primary"
                          />
                          <p id="accent-words-label" className="text-[11px] text-on-surface-variant">強調する言葉を選ぶ</p>
                          <div role="group" aria-labelledby="accent-words-label" className="flex flex-wrap gap-1.5 mt-1.5">
                            {c.words.map((w, i) => (
                              <button
                                key={i}
                                type="button"
                                aria-pressed={!!w.accent}
                                onClick={() => { pushHistory(); toggleAccent(c.id, i); }}
                                style={w.accent ? {background: accentColor, borderColor: accentColor, color: '#000'} : undefined}
                                className={`px-2 py-1 rounded text-[12px] border ${
                                  w.accent ? 'font-bold' : 'border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant'
                                }`}
                              >
                                {w.text}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-body-sm text-on-surface-variant truncate">{text}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {tab === 'B-roll' && (
          <>
            <button
              type="button"
              onClick={onGenerateBroll}
              disabled={brollGenerating || !clips.length}
              aria-busy={brollGenerating}
              className="w-full py-3 bg-primary-container text-on-primary-container rounded-lg font-bold text-body-md hover:brightness-110 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
            >
              <span aria-hidden="true" className={`material-symbols-outlined text-[20px] ${brollGenerating ? 'animate-spin' : ''}`}>{brollGenerating ? 'progress_activity' : 'movie'}</span>
              {brollGenerating ? '追加映像を探しています…' : 'AIで追加映像を探す'}
            </button>
            {brollGenerating && <p className="text-[11px] text-on-surface-variant mt-2 truncate">{brollLabel}</p>}
            <div className="mb-5" />

            {!brolls.length ? (
              <p className="text-body-sm text-on-surface-variant/75">
                追加映像はまだありません。このAI機能を使うには、先に音声字幕を作成してください。
              </p>
            ) : (
              <ul aria-label="追加映像の一覧" className="space-y-2 list-none m-0 p-0">
                {projBrolls.map((b) => {
                  const isSel = b.id === selectedId;
                  const pick = () => { select(b.id); seekMs(b.startMs + 20); };
                  return (
                    <li
                      key={b.id}
                      onClick={pick}
                      className={`p-3 rounded cursor-pointer transition-colors ${isSel ? 'bg-surface-variant/40 border-2 border-primary' : 'bg-surface-variant/20 border border-outline-variant/30 hover:border-primary/30'}`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <button
                          type="button"
                          aria-pressed={isSel}
                          aria-label={`追加映像 ${(b.startMs / 1000).toFixed(1)}秒: ${b.query ?? b.id}`}
                          onClick={(e) => { e.stopPropagation(); pick(); }}
                          className="text-[10px] font-mono text-on-surface-variant"
                        >
                          {(b.startMs / 1000).toFixed(1)}秒
                        </button>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase ${b.source === 'own' ? 'bg-secondary-container/40 text-secondary' : 'bg-tertiary-container/40 text-tertiary'}`}>{b.source ?? 'pexels'}</span>
                      </div>
                      <p className="text-body-sm text-on-surface truncate mb-2">{b.query ?? b.id}</p>
                      <div role="group" aria-label="表示位置" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                        {(['fullscreen', 'top', 'inset'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            aria-pressed={b.mode === m}
                            onClick={() => setBrollMode(b.id, m)}
                            className={`flex-1 py-1 text-[10px] rounded border ${b.mode === m ? 'border-primary text-primary bg-primary-container/20' : 'border-outline-variant/40 text-on-surface-variant'}`}
                          >
                            {m === 'fullscreen' ? '全画面' : m === 'top' ? '上部' : '小窓'}
                          </button>
                        ))}
                        {!!b.alternatives?.length && (
                          <IconButton icon="cached" label="別の追加映像に変更" onClick={() => swapBroll(b.id)} className="text-on-surface-variant hover:text-primary px-1" />
                        )}
                        <IconButton icon="delete" label="追加映像を削除" onClick={() => removeBroll(b.id)} className="text-on-surface-variant hover:text-error px-1" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {tab === 'Styles' && (
          <div>
            <p id="accent-color-label" className="text-label-bold font-label-bold uppercase text-on-surface-variant">強調色</p>
            <div role="group" aria-labelledby="accent-color-label" className="flex flex-wrap gap-2 mt-3">
              {ACCENT_SWATCHES.map((c) => {
                const on = accentColor.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`強調色 ${c}`}
                    aria-pressed={on}
                    onClick={() => setAccentColor(c)}
                    style={{background: c}}
                    className={`w-8 h-8 rounded-full border-2 ${on ? 'border-on-surface' : 'border-transparent'}`}
                    title={c}
                  />
                );
              })}
            </div>
            <p className="text-[11px] text-on-surface-variant/75 mt-3">字幕で強調する言葉の色です。</p>
          </div>
        )}

        {tab === 'Settings' && (
          <div className="space-y-5">
            <section aria-labelledby="music-heading">
              <h3 id="music-heading" className="text-label-bold font-label-bold uppercase text-on-surface-variant">音楽</h3>
              {music ? (
                <>
                  <p className="text-body-sm text-on-surface truncate mt-2 mb-3">{music.src.split('/').pop()}</p>
                  <label htmlFor="music-volume" className="text-[11px] text-on-surface-variant">音量: {Math.round(music.volume * 100)}%</label>
                  <input
                    id="music-volume"
                    type="range" min={0} max={100} value={Math.round(music.volume * 100)}
                    aria-valuetext={`${Math.round(music.volume * 100)}%`}
                    onChange={(e) => setMusic({...music, volume: Number(e.target.value) / 100})}
                    className="w-full mt-1 mb-3 accent-primary"
                  />
                  <label htmlFor="music-fade" className="text-[11px] text-on-surface-variant">フェードアウト: {music.fadeOutSec.toFixed(1)}秒</label>
                  <input
                    id="music-fade"
                    type="range" min={0} max={50} value={Math.round(music.fadeOutSec * 10)}
                    aria-valuetext={`${music.fadeOutSec.toFixed(1)}秒`}
                    onChange={(e) => setMusic({...music, fadeOutSec: Number(e.target.value) / 10})}
                    className="w-full mt-1 accent-primary"
                  />

                  {/* auto-duck under voice */}
                  <div className="flex items-center justify-between mt-4">
                    <span id="duck-label" className="text-[11px] text-on-surface-variant">話し声の間は音楽を小さくする</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!music.duck}
                      aria-labelledby="duck-label"
                      onClick={() => setMusic({...music, duck: !music.duck})}
                      title="話し声の間は音楽の音量を自動で下げます"
                      className={`w-9 h-5 rounded-full relative transition-colors ${music.duck ? 'bg-primary-container' : 'bg-surface-container-lowest border border-outline-variant/50'}`}
                    >
                      <span aria-hidden="true" className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${music.duck ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                  {music.duck && (
                    <>
                      <label htmlFor="music-duck-level" className="text-[11px] text-on-surface-variant">話し声の間の音量: {Math.round((music.duckLevel ?? 0.25) * 100)}%</label>
                      <input
                        id="music-duck-level"
                        type="range" min={5} max={80} value={Math.round((music.duckLevel ?? 0.25) * 100)}
                        aria-valuetext={`${Math.round((music.duckLevel ?? 0.25) * 100)}%`}
                        onChange={(e) => setMusic({...music, duckLevel: Number(e.target.value) / 100})}
                        className="w-full mt-1 accent-primary"
                      />
                      <p className="text-[10px] text-on-surface-variant/75 mt-1">話し声の検出には、先に字幕の作成が必要です。</p>
                    </>
                  )}
                </>
              ) : (
                <p className="text-body-sm text-on-surface-variant/75 mt-2">音楽はありません。左側の「素材」から追加できます。</p>
              )}
            </section>
            <dl className="pt-4 border-t border-outline-variant/30">
              <Row k="解像度" v={`${meta.width}×${meta.height}`} />
              <Row k="FPS" v={String(meta.fps)} />
              <Row k="動画の数" v={String(clips.length)} />
              <Row k="長さ" v={`${(meta.durationInFrames / meta.fps).toFixed(1)}秒`} />
            </dl>
          </div>
        )}
      </div>
    </aside>
  );
};

const Row: React.FC<{k: string; v: string}> = ({k, v}) => (
  <div className="flex justify-between py-1 text-body-sm border-b border-outline-variant/15">
    <dt className="text-on-surface-variant">{k}</dt>
    <dd className="text-on-surface font-mono m-0">{v}</dd>
  </div>
);
