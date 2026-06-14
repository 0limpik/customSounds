/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByCodeLazy } from "@webpack";

const AudioPlayerCtor = findByCodeLazy("could not play audio");

export interface PreprocessAudioData { audio: string; volume: number; }

export interface AudioPlayer {
    preprocessDataOriginal: PreprocessAudioData;
    preprocessDataCurrent: PreprocessAudioData;
    audio: string;
    _audio: null | Promise<HTMLAudioElement>;
    _volume: number;
    type: string;
    processAudio(): void;
    destroyAudio(): void;
    play(): void;
    stop(): void;
}

export interface PreviewHandle { stop(): void; volume: number; }

export function playAudio(audio: string, opts: { volume?: number; } = {}): PreviewHandle {
    const p: AudioPlayer = new AudioPlayerCtor(audio, null, null, "default", opts);
    p.play();
    return {
        stop: () => p.stop(),
        get volume() { return p._volume * 100; },
        set volume(v: number) {
            p.preprocessDataOriginal.volume = Math.max(0, v / 100);
            p.processAudio();
        }
    };
}

export interface StoredAudioFile { id: string; name: string; dataUri: string; }
export interface ExportedAudioFile { id: string; name: string; dataUri: string; }

export const dataUriCache = new Map<string, string>();

async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return `$${Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("")}`;
}

async function generateDataURI(buffer: ArrayBuffer, type: string): Promise<string> {
    const blob = new Blob([new Uint8Array(buffer)], { type: type || "audio/mpeg" });
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
    });
}

function dataUriToArrayBuffer(dataUri: string): ArrayBuffer | null {
    const i = dataUri.indexOf(",");
    if (i === -1 || !dataUri.slice(0, i).includes(";base64")) return null;
    try {
        const bin = atob(dataUri.slice(i + 1));
        const bytes = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
        return bytes.buffer;
    } catch { return null; }
}

export function getAllAudio(store: Record<string, string>): Record<string, StoredAudioFile> {
    let all: Record<string, StoredAudioFile> = {};
    for (const [name, value] of Object.entries(store)) {
        if (!name.startsWith("$")) {
            continue;
        }
        all[name.slice(1)] = JSON.parse(value);
    }
    return all;
}

export function getAudioMeta(store: Record<string, string>): Record<string, string> {
    const all = getAllAudio(store);
    const meta: Record<string, string> = {};
    for (const [id, f] of Object.entries(all)) meta[id] = f.name;
    return meta;
}

export async function saveAudio(file: File, store: Record<string, string>): Promise<string> {
    const buffer = await file.arrayBuffer();
    const id = await hashBuffer(buffer);
    const dataUri = await generateDataURI(buffer, file.type);
    const value: StoredAudioFile = { id: id, name: file.name, dataUri: dataUri };
    store[id] = JSON.stringify(value);
    return id;
}

export function deleteAudio(id: string, store: Record<string, string>): void {
    const all = getAllAudio(store);
    delete all[id];
}

export function ensureDataURICached(fileId: string, store: Record<string, string>): string | null {
    if (dataUriCache.has(fileId)) return dataUriCache.get(fileId)!;
    try {
        const e = getAllAudio(store)[fileId];
        if (e?.dataUri) { dataUriCache.set(fileId, e.dataUri); return e.dataUri; }
    } catch (e) { console.error("[CustomSounds]", e); }
    return null;
}

export async function importAudio(data: ExportedAudioFile, store: Record<string, string>): Promise<string | null> {
    const buffer = data.dataUri ? dataUriToArrayBuffer(data.dataUri) : null;
    if (!buffer) return null;
    const id = await hashBuffer(buffer);
    const all = getAllAudio(store);
    all[id] = { id, name: data.name || "Imported", dataUri: data.dataUri };
    return id;
}
