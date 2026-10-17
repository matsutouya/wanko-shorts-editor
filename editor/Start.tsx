import React, {useEffect, useRef, useState} from 'react';
import {useEditor} from './store';
import {IconButton} from './IconButton';

export type ProjectMeta = {id: string; name: string; clips: number; updatedAt: string | null; thumb: string | null};
type HealthCheck = {id: string; ok: boolean; label: string; hint: string; optional?: boolean};
type Health = {ok: boolean; checks: HealthCheck[]};

const ago = (iso: string | null) => {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'たった今';
  if (d < 3600) return `${Math.floor(d / 60)}分前`;
  if (d < 86400) return `${Math.floor(d / 3600)}時間前`;
  return `${Math.floor(d / 86400)}日前`;
};

const healthText: Record<string, {label: string; hint: string}> = {
  node: {label: 'Node.js', hint: 'バージョン20以上が必要です'},
  ffmpeg: {label: 'FFmpeg', hint: '動画の読み込みと書き出しに必要です。Macでは brew install ffmpeg'},
  whisperx: {label: 'WhisperX', hint: '音声の字幕と自動カット用。犬の映像だけなら後から設定できます'},
  gemini: {label: 'Gemini APIキー', hint: 'AIによる並べ替えやBロール用。手動編集には不要です'},
  pexels: {label: 'Pexels APIキー', hint: '素材検索用の任意設定です'},
};

// Home screen: open a recent project, or drop clips to start a new one.
export const Start: React.FC<{
  projects: ProjectMeta[];
  onNew: () => void;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}> = ({projects, onNew, onOpen, onRefresh}) => {
  const {clips, addClip} = useEditor();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const checkHealth = () => fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
  useEffect(() => { checkHealth(); }, []);
  const problems = health?.checks.filter((c) => !c.ok) ?? [];

  const importFiles = async (files: File[]) => {
    const vids = files.filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name));
    if (!vids.length) return;
    for (let i = 0; i < vids.length; i++) {
      setBusy(`読み込み中: ${vids[i].name} (${i + 1}/${vids.length})…`);
      try {
        const clip = await fetch('/api/add-clip?name=' + encodeURIComponent(vids[i].name), {method: 'POST', body: vids[i]}).then((r) => r.json());
        if (clip?.id) addClip(clip);
      } catch {
        /* skip */
      }
    }
    setBusy(null);
  };
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    importFiles(files);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    importFiles(Array.from(e.dataTransfer.files ?? []));
  };
  const del = async (id: string) => {
    if (!window.confirm('このプロジェクトを削除しますか？元の動画ファイルは削除されません。')) return;
    await fetch('/api/projects/' + id, {method: 'DELETE'}).catch(() => {});
    onRefresh();
  };

  return (
    <main className="h-screen bg-background text-on-surface flex flex-col items-center overflow-y-auto py-12 px-8">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-headline-lg font-headline-lg font-bold">わんこショート編集</h1>
          <p className="text-body-md text-on-surface-variant mt-1">犬の動画を入れて、見せ場を選んで編集しましょう</p>
        </div>

        {/* Setup problems (from /api/health): shown until everything the AI steps need is in place */}
        {problems.length > 0 && (
          <section aria-labelledby="setup-heading" className="mb-6 rounded-xl border border-outline-variant/60 bg-surface-container-low p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 id="setup-heading" className="text-body-md font-bold">設定状況</h2>
              <button type="button" onClick={checkHealth} className="text-[11px] tracking-wide text-primary hover:underline">再確認</button>
            </div>
            <ul className="space-y-1.5">
              {problems.map((c) => (
                <li key={c.id} className="flex gap-2 text-body-sm">
                  <span aria-hidden="true" className={`material-symbols-outlined text-[18px] ${c.id === 'node' || c.id === 'ffmpeg' ? 'text-error' : 'text-on-surface-variant'}`}>{c.id === 'node' || c.id === 'ffmpeg' ? 'error' : 'info'}</span>
                  <span><span className="font-medium">{healthText[c.id]?.label ?? c.label}</span> <span className="text-on-surface-variant">— {healthText[c.id]?.hint ?? c.hint}</span></span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-on-surface-variant mt-3">必要な場合はプロジェクト内で <code className="px-1 rounded bg-surface-container">npm run setup</code> を実行し、<code className="px-1 rounded bg-surface-container">.env</code> を設定します。</p>
          </section>
        )}

        {/* New project */}
        <input ref={inputRef} type="file" accept="video/*" multiple onChange={onPick} className="hidden" aria-label="動画ファイルを選ぶ" />
        <div
          onClick={() => !clips.length && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 py-12 transition-all ${
            dragOver ? 'border-primary bg-primary-container/10' : 'border-outline-variant bg-surface-container-low'
          } ${clips.length ? '' : 'cursor-pointer hover:border-primary/60'}`}
        >
          <span aria-hidden="true" className={`material-symbols-outlined text-[48px] text-primary ${busy ? 'animate-spin' : ''}`}>{busy ? 'progress_activity' : 'video_library'}</span>
          {/* upload progress is announced as it changes */}
          <p role="status" aria-live="polite" className={busy ? 'text-body-md text-primary' : 'sr-only'}>{busy ?? ''}</p>
          {busy ? null : clips.length ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-body-md text-on-surface">{clips.length}本の動画を読み込みました</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => inputRef.current?.click()} className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-variant text-body-md font-bold">動画を追加</button>
                <button type="button" onClick={onNew} className="bg-primary-container text-on-primary-container px-5 py-2 rounded-lg font-bold text-body-md hover:brightness-110 active:scale-95 transition-all flex items-center gap-1">
                  編集を始める <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" className="bg-primary-container text-on-primary-container px-6 py-2.5 rounded-lg font-bold text-body-md hover:brightness-110 active:scale-95 transition-all">新しく作る・動画を選ぶ</button>
              <p className="text-body-sm text-on-surface-variant">動画をここにドラッグしても読み込めます</p>
            </>
          )}
        </div>

        {/* Recent projects */}
        {projects.length > 0 && (
          <section aria-labelledby="recent-heading" className="mt-10">
            <h2 id="recent-heading" className="text-label-bold font-label-bold uppercase tracking-wider text-on-surface-variant mb-3">最近のプロジェクト</h2>
            <ul className="grid grid-cols-3 gap-3 list-none m-0 p-0">
              {projects.map((p) => {
                const clipsLabel = `動画 ${p.clips}本`;
                return (
                  // the open button and the delete button are siblings (no nested controls);
                  // the delete button is revealed on hover AND on keyboard focus
                  <li key={p.id} className="group relative rounded-lg overflow-hidden border border-outline-variant/50 bg-surface-container-low hover:border-primary focus-within:border-primary transition-all">
                    <button
                      type="button"
                      onClick={() => onOpen(p.id)}
                      aria-label={`${p.name}を開く、${clipsLabel}、更新: ${ago(p.updatedAt) || '不明'}`}
                      className="w-full text-left cursor-pointer"
                    >
                      <div className="aspect-video bg-surface-container">
                        {p.thumb ? (
                          <img src={p.thumb} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-on-surface-variant/40">
                            <span aria-hidden="true" className="material-symbols-outlined">movie</span>
                          </div>
                        )}
                      </div>
                      <div className="p-2">
                        <p className="text-body-sm font-medium truncate">{p.name}</p>
                        <p className="text-[11px] text-on-surface-variant">{clipsLabel} · {ago(p.updatedAt)}</p>
                      </div>
                    </button>
                    <IconButton
                      icon="delete"
                      size={16}
                      label={`${p.name}を削除`}
                      onClick={() => del(p.id)}
                      className="absolute top-1 right-1 w-6 h-6 rounded bg-surface-container-lowest/80 text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
};
