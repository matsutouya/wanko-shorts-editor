import React, {useEffect, useState} from 'react';
import type {PlayerRef} from '@remotion/player';
import {useEditor} from './store';
import {placeClips} from '../src/timeline';

type Frame = {atSec: number; url: string};

const time = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export const HighlightsPanel: React.FC<{playerRef: React.RefObject<PlayerRef | null>}> = ({playerRef}) => {
  const {clips, meta, selectedClipId, selectClip} = useEditor();
  const [clipId, setClipId] = useState(selectedClipId ?? clips[0]?.id ?? '');
  const [count, setCount] = useState(12);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const clip = clips.find((item) => item.id === clipId) ?? clips[0];

  useEffect(() => {
    if (!clip || !meta) { setFrames([]); return; }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const query = new URLSearchParams({src: clip.src, start: String(clip.inSec), end: String(clip.outSec), count: String(count)});
    fetch(`/api/scene-frames?${query}`, {signal: controller.signal})
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '静止画を作成できませんでした');
        return data;
      })
      .then((data) => setFrames(Array.isArray(data.frames) ? data.frames : []))
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '静止画を作成できませんでした'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [clip?.src, clip?.inSec, clip?.outSec, count, meta?.fps]);

  const jump = (atSec: number) => {
    if (!clip || !meta) return;
    const placed = placeClips(clips, meta.fps).find((item) => item.clip.id === clip.id);
    if (!placed) return;
    const timelineSec = placed.startMs / 1000 + (atSec - clip.inSec) / (clip.speed ?? 1);
    playerRef.current?.pause();
    playerRef.current?.seekTo(Math.round(timelineSec * meta.fps));
    selectClip(clip.id);
  };

  return (
    <section aria-label="見せ場を探す" className="space-y-3">
      <p className="text-body-sm text-on-surface-variant">動画の場面を静止画で一覧表示します。気になる場面を押して確認し、タイムラインで分割してください。</p>
      {!clips.length ? <p className="text-body-sm text-on-surface-variant">まず動画を読み込んでください。</p> : (
        <>
          <label htmlFor="highlight-clip" className="block text-body-sm font-bold">確認する動画</label>
          <select id="highlight-clip" value={clip?.id ?? ''} onChange={(e) => setClipId(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant rounded px-2 py-2 text-body-md text-on-surface">
            {clips.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.label ?? item.id}</option>)}
          </select>
          <div className="flex gap-2" role="group" aria-label="静止画の枚数">
            {[12, 24].map((n) => <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)} className={`flex-1 rounded border px-2 py-1.5 text-body-sm ${count === n ? 'border-primary text-primary bg-primary-container/20' : 'border-outline-variant text-on-surface-variant'}`}>{n === 12 ? '標準' : '細かく見る'}</button>)}
          </div>
          {loading && <p role="status" className="text-body-sm text-on-surface-variant">場面を読み込み中…</p>}
          {error && <p role="alert" className="text-body-sm text-error">{error}</p>}
          {!loading && !error && <div className="grid grid-cols-2 gap-2">
            {frames.map((frame) => <button key={frame.url} type="button" onClick={() => jump(frame.atSec)} aria-label={`${time(frame.atSec)}の場面へ移動`} className="overflow-hidden rounded border border-outline-variant bg-surface-container-lowest text-left hover:border-primary focus-visible:border-primary">
              <img src={frame.url} alt="" loading="lazy" className="aspect-video w-full object-cover" />
              <span className="block px-2 py-1 text-body-sm text-on-surface">{time(frame.atSec)}</span>
            </button>)}
          </div>}
        </>
      )}
    </section>
  );
};
