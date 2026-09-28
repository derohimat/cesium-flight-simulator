import { useState, useRef } from 'react';
import { Panel } from '../../../shared/components/Panel';

interface Keyframe {
    id: string;
    time: number; // in seconds
    lat: number;
    lon: number;
    altitude: number;
    heading: number;
    pitch: number;
    roll: number;
    label?: string;
}

interface FlightTimelineProps {
    keyframes: Keyframe[];
    onKeyframesChange: (keyframes: Keyframe[]) => void;
    onAddKeyframe: () => void;
    onDeleteKeyframe: (id: string) => void;
    onPreview: (keyframeId: string) => void;
    onPlayPreview: () => void;
    onStopPreview: () => void;
    isPlaying: boolean;
    currentTime: number;
    totalDuration: number;
    onSeek: (time: number) => void;
}

export function FlightTimeline({
    keyframes,
    onKeyframesChange,
    onAddKeyframe,
    onDeleteKeyframe,
    onPreview,
    onPlayPreview,
    onStopPreview,
    isPlaying,
    currentTime,
    totalDuration,
    onSeek,
}: FlightTimelineProps) {
    const [selectedKeyframe, setSelectedKeyframe] = useState<string | null>(null);
    const [_isDragging, setIsDragging] = useState(false);
    const timelineRef = useRef<HTMLDivElement>(null);

    // Calculate playhead position
    const playheadPosition = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

    // Handle timeline click for seeking
    const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineRef.current) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;
        const newTime = percentage * totalDuration;
        onSeek(Math.max(0, Math.min(totalDuration, newTime)));
    };

    // Format time as MM:SS
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Handle keyframe drag (for future use with drag-and-drop)
    const _handleKeyframeDrag = (id: string, newTime: number) => {
        const updated = keyframes.map(kf =>
            kf.id === id ? { ...kf, time: Math.max(0, Math.min(totalDuration, newTime)) } : kf
        );
        onKeyframesChange(updated.sort((a, b) => a.time - b.time));
    };

    return (
        <Panel title="⏱️ Flight Timeline" className="w-full">
            <div className="space-y-4">
                {/* Transport Controls */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onSeek(0)}
                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                            title="Go to start"
                        >
                            ⏮️
                        </button>
                        <button
                            onClick={isPlaying ? onStopPreview : onPlayPreview}
                            className={`p-3 rounded-lg font-medium transition-all ${isPlaying
                                    ? 'bg-yellow-500 text-black hover:bg-yellow-400'
                                    : 'bg-future-primary text-white hover:bg-future-primary/80'
                                }`}
                            title={isPlaying ? 'Pause' : 'Play'}
                        >
                            {isPlaying ? '⏸️' : '▶️'}
                        </button>
                        <button
                            onClick={() => onSeek(totalDuration)}
                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                            title="Go to end"
                        >
                            ⏭️
                        </button>
                    </div>

                    <div className="flex items-center gap-3 text-sm font-mono">
                        <span className="text-future-primary">{formatTime(currentTime)}</span>
                        <span className="text-white/40">/</span>
                        <span className="text-white/60">{formatTime(totalDuration)}</span>
                    </div>

                    <button
                        onClick={onAddKeyframe}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-future-primary to-future-secondary text-white text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                        ➕ Add Keyframe
                    </button>
                </div>

                {/* Timeline Track */}
                <div
                    ref={timelineRef}
                    className="relative h-20 bg-gradient-to-r from-black/40 via-black/30 to-black/40 rounded-xl border border-white/10 cursor-pointer overflow-hidden"
                    onClick={handleTimelineClick}
                >
                    {/* Grid Lines */}
                    <div className="absolute inset-0 flex">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div
                                key={i}
                                className="flex-1 border-r border-white/5 last:border-r-0"
                            />
                        ))}
                    </div>

                    {/* Keyframes */}
                    <div className="absolute inset-0">
                        {keyframes.map((kf, index) => {
                            const position = (kf.time / totalDuration) * 100;
                            const isSelected = selectedKeyframe === kf.id;

                            return (
                                <div
                                    key={kf.id}
                                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing z-10 ${isSelected ? 'scale-125 z-20' : ''
                                        }`}
                                    style={{ left: `${position}%` }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedKeyframe(kf.id);
                                        onPreview(kf.id);
                                    }}
                                    draggable
                                    onDragStart={() => setIsDragging(true)}
                                    onDragEnd={() => setIsDragging(false)}
                                >
                                    <div className={`w-4 h-10 rounded-full transition-all ${isSelected
                                            ? 'bg-gradient-to-b from-future-primary to-future-secondary shadow-glow'
                                            : 'bg-gradient-to-b from-white/60 to-white/40 hover:from-white hover:to-white/60'
                                        }`} />
                                    <div className={`absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap ${isSelected ? 'text-future-primary' : 'text-white/50'
                                        }`}>
                                        {kf.label || `KF ${index + 1}`}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Playhead */}
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
                        style={{ left: `${playheadPosition}%` }}
                    >
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rotate-45" />
                    </div>

                    {/* Time markers */}
                    <div className="absolute bottom-0 left-0 right-0 h-5 flex text-[10px] text-white/30">
                        {Array.from({ length: 11 }).map((_, i) => (
                            <div key={i} className="flex-1 text-center pt-1">
                                {formatTime((totalDuration / 10) * i)}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Keyframe List */}
                <div className="max-h-32 overflow-y-auto space-y-1">
                    {keyframes.length === 0 ? (
                        <div className="text-center py-4 text-white/40 text-sm">
                            No keyframes yet. Add your first keyframe to start!
                        </div>
                    ) : (
                        keyframes.map((kf, index) => (
                            <div
                                key={kf.id}
                                className={`flex items-center gap-3 p-2 rounded-lg transition-colors cursor-pointer ${selectedKeyframe === kf.id
                                        ? 'bg-future-primary/20 border border-future-primary/40'
                                        : 'bg-white/5 hover:bg-white/10'
                                    }`}
                                onClick={() => {
                                    setSelectedKeyframe(kf.id);
                                    onPreview(kf.id);
                                }}
                            >
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-future-primary to-future-secondary flex items-center justify-center text-xs font-bold">
                                    {index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <input
                                        type="text"
                                        value={kf.label || `Keyframe ${index + 1}`}
                                        onChange={(e) => {
                                            const updated = keyframes.map(k =>
                                                k.id === kf.id ? { ...k, label: e.target.value } : k
                                            );
                                            onKeyframesChange(updated);
                                        }}
                                        className="bg-transparent text-sm text-white font-medium focus:outline-none w-full"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <div className="text-xs text-white/50 font-mono">
                                        {formatTime(kf.time)} • Alt: {kf.altitude.toFixed(0)}m
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteKeyframe(kf.id);
                                    }}
                                    className="p-1.5 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                                >
                                    🗑️
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Quick Actions */}
                <div className="flex gap-2 pt-2 border-t border-white/10">
                    <button className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-sm transition-colors">
                        📋 Copy Path
                    </button>
                    <button className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-sm transition-colors">
                        📥 Import
                    </button>
                    <button className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-sm transition-colors">
                        📤 Export
                    </button>
                </div>
            </div>
        </Panel>
    );
}

export type { Keyframe };
