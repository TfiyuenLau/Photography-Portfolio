'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Album, AlbumTitle, Folder, FolderName, Photo, SiteConfig } from '@/types';
import { titleToSlug } from '@/lib/api/slug';
import ChinaCoordPicker from '@/lib/admin/china-coord-picker';

type PortfolioStore = {
  albums: Album[];
  albumPhotos: Record<string, Photo[]>;
  folders: Folder[];
  folderPhotos: Record<string, Photo[]>;
};

type GitStatusInfo = {
  changes: string[];
  commits: Array<{ hash: string; subject: string; time: string }>;
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [section, setSection] = useState<'albums' | 'folders' | 'profile'>('albums');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [store, setStore] = useState<PortfolioStore | null>(null);
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);

  const [selectedAlbumIdx, setSelectedAlbumIdx] = useState(0);
  const [selectedFolderIdx, setSelectedFolderIdx] = useState(0);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [batchTagInput, setBatchTagInput] = useState('');

  const [gitInfo, setGitInfo] = useState<GitStatusInfo>({ changes: [], commits: [] });
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);

  const showToast = useCallback((type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    setTimeout(() => {
      setToast(prev => (prev?.text === text ? null : prev));
    }, 3000);
  }, []);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/portfolio');
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setStore(data.portfolioData);
        setSiteConfig(data.siteConfig);
      } else {
        showToast('err', data.message || 'Load failed');
      }
    } catch {
      showToast('err', 'API error');
    } finally {
      setLoading(false);
    }
  }, [router, showToast]);

  const fetchGitInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/git');
      const data = await res.json();
      if (data.success) {
        setGitInfo({ changes: data.changes || [], commits: data.commits || [] });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchAllData();
    fetchGitInfo();
  }, [fetchAllData, fetchGitInfo]);

  async function handleSaveAll() {
    if (!store || !siteConfig) return;
    setSaving(true);
    try {
      const normalizedAlbums = store.albums.map((a, idx) => ({
        ...a,
        order: idx + 1
      }));
      const normalizedFolders = store.folders.map((f, idx) => ({
        ...f,
        order: idx + 1
      }));
      const updatedStore: PortfolioStore = {
        ...store,
        albums: normalizedAlbums,
        folders: normalizedFolders
      };

      const res = await fetch('/api/admin/portfolio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioData: updatedStore,
          siteConfig
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStore(updatedStore);
        showToast('ok', 'Saved');
        fetchGitInfo();
      } else {
        showToast('err', data.message || 'Save failed');
      }
    } catch {
      showToast('err', 'Save error');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.push('/admin/login');
  }

  if (loading || !store || !siteConfig) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center text-gray-400 text-sm">
        Loading...
      </main>
    );
  }

  const currentAlbum = store.albums[selectedAlbumIdx] || store.albums[0];
  const currentFolder = store.folders[selectedFolderIdx] || store.folders[0];

  const isAlbumMode = section === 'albums';
  const currentPhotosKey = isAlbumMode ? currentAlbum?.title : currentFolder?.title;
  const currentPhotosList: Photo[] = isAlbumMode
    ? store.albumPhotos[currentPhotosKey] || []
    : store.folderPhotos[currentPhotosKey] || [];

  function updateCurrentAlbum(updater: (album: Album) => Album) {
    if (!store || !currentAlbum) return;
    const oldTitle = currentAlbum.title;
    const updated = updater(currentAlbum);
    const newAlbums = [...store.albums];
    newAlbums[selectedAlbumIdx] = updated;

    const newAlbumPhotos = { ...store.albumPhotos };
    if (oldTitle !== updated.title) {
      newAlbumPhotos[updated.title] = newAlbumPhotos[oldTitle] || [];
      delete newAlbumPhotos[oldTitle];
    }

    setStore({
      ...store,
      albums: newAlbums,
      albumPhotos: newAlbumPhotos
    });
  }

  function updateCurrentFolder(updater: (folder: Folder) => Folder) {
    if (!store || !currentFolder) return;
    const oldTitle = currentFolder.title;
    const updated = updater(currentFolder);
    const newFolders = [...store.folders];
    newFolders[selectedFolderIdx] = updated;

    const newFolderPhotos = { ...store.folderPhotos };
    if (oldTitle !== updated.title) {
      newFolderPhotos[updated.title] = newFolderPhotos[oldTitle] || [];
      delete newFolderPhotos[oldTitle];
    }

    setStore({
      ...store,
      folders: newFolders,
      folderPhotos: newFolderPhotos
    });
  }

  function handleAddAlbum() {
    if (!store) return;
    const newTitle = `Album ${store.albums.length + 1}` as AlbumTitle;
    const newAlbum: Album = {
      title: newTitle,
      slug: `album-${store.albums.length + 1}`,
      province: 'Beijing',
      color: '#880808',
      type: 'location',
      description: 'Beiping',
      date: `${new Date().getFullYear()}.01`,
      lat: 39.9042,
      lng: 116.4074,
      locations: [],
      tags: ['Beijing', new Date().getFullYear().toString()],
      order: store.albums.length + 1
    };
    setStore({
      ...store,
      albums: [...store.albums, newAlbum],
      albumPhotos: { ...store.albumPhotos, [newTitle]: [] }
    });
    setSelectedAlbumIdx(store.albums.length);
  }

  function handleDeleteAlbum(idx: number) {
    if (!store || store.albums.length <= 1) return;
    const target = store.albums[idx];
    const newAlbums = store.albums.filter((_, i) => i !== idx);
    const newPhotos = { ...store.albumPhotos };
    delete newPhotos[target.title];
    setStore({
      ...store,
      albums: newAlbums,
      albumPhotos: newPhotos
    });
    setSelectedAlbumIdx(Math.max(0, idx - 1));
  }

  function handleMoveAlbum(idx: number, dir: -1 | 1) {
    if (!store) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= store.albums.length) return;
    const newAlbums = [...store.albums];
    const [item] = newAlbums.splice(idx, 1);
    newAlbums.splice(targetIdx, 0, item);
    setStore({ ...store, albums: newAlbums });
    setSelectedAlbumIdx(targetIdx);
  }

  function handleAddFolder() {
    if (!store) return;
    const newTitle = `Folder ${store.folders.length + 1}` as FolderName;
    const newFolder: Folder = {
      title: newTitle,
      slug: `folder-${store.folders.length + 1}`,
      parentTitle: null,
      description: 'Archive',
      date: `${new Date().getFullYear()}`,
      order: store.folders.length + 1
    };
    setStore({
      ...store,
      folders: [...store.folders, newFolder],
      folderPhotos: { ...store.folderPhotos, [newTitle]: [] }
    });
    setSelectedFolderIdx(store.folders.length);
  }

  function handleDeleteFolder(idx: number) {
    if (!store || store.folders.length <= 1) return;
    const target = store.folders[idx];
    const nextFolders = store.folders.filter((_, i) => i !== idx);
    const nextPhotos = { ...store.folderPhotos };
    delete nextPhotos[target.title];
    setStore({
      ...store,
      folders: nextFolders,
      folderPhotos: nextPhotos
    });
    setSelectedFolderIdx(Math.max(0, idx - 1));
  }

  function updateCurrentPhotos(newPhotos: Photo[]) {
    if (!store || !currentPhotosKey) return;
    if (isAlbumMode) {
      setStore({
        ...store,
        albumPhotos: {
          ...store.albumPhotos,
          [currentPhotosKey]: newPhotos
        }
      });
    } else {
      setStore({
        ...store,
        folderPhotos: {
          ...store.folderPhotos,
          [currentPhotosKey]: newPhotos
        }
      });
    }
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0 || !store) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach(file => formData.append('files', file));
      const autoTags = [
        isAlbumMode ? currentAlbum?.province || '' : '',
        isAlbumMode ? (currentAlbum?.tags || []).join(',') : ''
      ]
        .filter(Boolean)
        .join(',');
      formData.append('tags', autoTags);

      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.photos)) {
        updateCurrentPhotos([...data.photos, ...currentPhotosList]);
        showToast('ok', `Uploaded ${data.photos.length} photos`);
      } else {
        showToast('err', data.message || 'Upload failed');
      }
    } catch {
      showToast('err', 'Upload error');
    } finally {
      setUploading(false);
    }
  }

  function handleAddManualUrlPhoto() {
    if (!manualUrl.trim()) return;
    const newPhoto: Photo = {
      id: `photo-${Date.now()}`,
      title: `Photo #${currentPhotosList.length + 1}`,
      date: new Date().getFullYear().toString(),
      tags: isAlbumMode ? [...(currentAlbum?.tags || [])] : ['Featured'],
      size: 350000,
      url: manualUrl.trim(),
      width: 3000,
      height: 2000
    };
    updateCurrentPhotos([newPhoto, ...currentPhotosList]);
    setManualUrl('');
  }

  function handleBatchAddTag() {
    const clean = batchTagInput.trim();
    if (!clean) return;
    const updated = currentPhotosList.map(p => ({
      ...p,
      tags: Array.from(new Set([...(p.tags || []), clean]))
    }));
    updateCurrentPhotos(updated);
    setBatchTagInput('');
    showToast('ok', `Tagged #${clean}`);
  }

  async function handleGitCommit() {
    setCommitting(true);
    try {
      await handleSaveAll();
      const res = await fetch('/api/admin/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message:
            commitMessage.trim() ||
            `content: update portfolio (${new Date().toISOString().slice(0, 10)})`
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('ok', 'Git committed');
        setCommitMessage('');
        fetchGitInfo();
      } else {
        showToast('err', data.message || 'Commit failed');
      }
    } catch {
      showToast('err', 'Git error');
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-black flex flex-col sm:flex-row">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-2 rounded text-xs font-medium transition-all ${
            toast.type === 'ok' ? 'bg-black text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Left Sidebar (matching homepage/nav style) */}
      <aside className="w-full sm:w-64 shrink-0 border-b sm:border-b-0 sm:border-r border-gray-100 p-6 sm:pt-12 sm:pl-10 flex flex-col justify-between gap-8">
        <div className="space-y-6">
          <div>
            <Link
              href="/"
              className="text-xs text-gray-400 hover:text-black transition-colors"
            >
              &larr; Home
            </Link>
            <h1 className="font-bold text-2xl tracking-tight mt-2">
              {siteConfig.photographerName}
            </h1>
            <p className="text-xs text-gray-400">Studio</p>
          </div>

          {/* Section Switcher */}
          <div className="flex items-center gap-4 text-sm border-b border-gray-100 pb-2">
            {(
              [
                { id: 'albums', label: 'Albums' },
                { id: 'folders', label: 'Folders' },
                { id: 'profile', label: 'Profile' }
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`tracking-tight transition-colors ${
                  section === tab.id
                    ? 'font-bold text-black'
                    : 'text-gray-400 hover:text-black'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Item List for Albums */}
          {section === 'albums' && (
            <div className="space-y-2">
              <ul className="space-y-1 text-base tracking-tight">
                {store.albums.map((album, idx) => {
                  const active = idx === selectedAlbumIdx;
                  const count = (store.albumPhotos[album.title] || []).length;
                  return (
                    <li
                      key={`${album.title}-${idx}`}
                      className="group flex items-center justify-between py-0.5 cursor-pointer"
                      onClick={() => setSelectedAlbumIdx(idx)}
                    >
                      <span
                        className={`truncate ${
                          active
                            ? 'font-bold text-black'
                            : 'text-gray-400 hover:text-black'
                        }`}
                      >
                        {album.title}
                        <span className="text-xs font-normal text-gray-300 ml-1.5">
                          {count}
                        </span>
                      </span>

                      <span
                        className="hidden group-hover:flex items-center gap-1 text-xs text-gray-400"
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleMoveAlbum(idx, -1)}
                          className="hover:text-black px-0.5"
                        >
                          &uarr;
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveAlbum(idx, 1)}
                          className="hover:text-black px-0.5"
                        >
                          &darr;
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAlbum(idx)}
                          className="hover:text-red-600 px-0.5"
                        >
                          &times;
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>

              <button
                type="button"
                onClick={handleAddAlbum}
                className="text-xs text-gray-400 hover:text-black pt-1 transition-colors"
              >
                + New Album
              </button>
            </div>
          )}

          {/* Item List for Folders */}
          {section === 'folders' && (
            <div className="space-y-2">
              <ul className="space-y-1 text-base tracking-tight">
                {store.folders.map((folder, idx) => {
                  const active = idx === selectedFolderIdx;
                  const count = (store.folderPhotos[folder.title] || []).length;
                  return (
                    <li
                      key={`${folder.title}-${idx}`}
                      className="group flex items-center justify-between py-0.5 cursor-pointer"
                      onClick={() => setSelectedFolderIdx(idx)}
                    >
                      <span
                        className={`truncate ${
                          active
                            ? 'font-bold text-black'
                            : 'text-gray-400 hover:text-black'
                        }`}
                      >
                        {folder.title}
                        <span className="text-xs font-normal text-gray-300 ml-1.5">
                          {count}
                        </span>
                      </span>
                      {store.folders.length > 1 && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteFolder(idx);
                          }}
                          className="hidden group-hover:inline text-xs text-gray-400 hover:text-red-600 px-1"
                        >
                          &times;
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              <button
                type="button"
                onClick={handleAddFolder}
                className="text-xs text-gray-400 hover:text-black pt-1 transition-colors"
              >
                + New Folder
              </button>
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="space-y-2 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="w-full py-2 bg-black hover:bg-gray-800 text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
            <button
              type="button"
              onClick={handleGitCommit}
              disabled={committing}
              className="hover:text-black transition-colors"
            >
              {committing ? 'Committing...' : 'Git Snapshot'}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="hover:text-black transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 sm:p-12 max-w-5xl space-y-10 overflow-y-auto">
        {/* ALBUMS OR FOLDERS WORKSPACE */}
        {(section === 'albums' || section === 'folders') && (
          <>
            {/* Metadata Section */}
            {isAlbumMode && currentAlbum ? (
              <section className="space-y-5">
                <div className="flex items-baseline justify-between border-b border-gray-100 pb-3">
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-2xl font-bold tracking-tight">
                      {currentAlbum.title}
                    </h2>
                    <Link
                      href={`/${titleToSlug(currentAlbum.title, currentAlbum.slug)}`}
                      target="_blank"
                      className="text-xs font-mono text-gray-400 hover:text-black"
                    >
                      /{titleToSlug(currentAlbum.title, currentAlbum.slug)} &#8599;
                    </Link>
                  </div>

                  {currentAlbum.type === 'location' && (
                    <button
                      type="button"
                      onClick={() => setShowMapPicker(v => !v)}
                      className="text-xs px-2.5 py-1 border border-gray-200 hover:border-black rounded transition-colors"
                    >
                      {showMapPicker ? 'Hide Map' : 'Map Picker'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <label className="block text-gray-400 mb-1">Title</label>
                    <input
                      type="text"
                      value={currentAlbum.title}
                      onChange={e =>
                        updateCurrentAlbum(a => ({
                          ...a,
                          title: e.target.value as AlbumTitle
                        }))
                      }
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Slug</label>
                    <input
                      type="text"
                      value={currentAlbum.slug || ''}
                      onChange={e =>
                        updateCurrentAlbum(a => ({ ...a, slug: e.target.value }))
                      }
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded font-mono focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Type</label>
                    <select
                      value={currentAlbum.type}
                      onChange={e =>
                        updateCurrentAlbum(a => ({
                          ...a,
                          type: e.target.value as 'location' | 'custom'
                        }))
                      }
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded bg-white focus:outline-none focus:border-black"
                    >
                      <option value="location">Location</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Date</label>
                    <input
                      type="text"
                      value={currentAlbum.date || ''}
                      onChange={e =>
                        updateCurrentAlbum(a => ({
                          ...a,
                          date: e.target.value || null
                        }))
                      }
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-gray-400 mb-1">Subtitle</label>
                    <input
                      type="text"
                      value={currentAlbum.description || ''}
                      onChange={e =>
                        updateCurrentAlbum(a => ({
                          ...a,
                          description: e.target.value || null
                        }))
                      }
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Tags</label>
                    <input
                      type="text"
                      value={(currentAlbum.tags || []).join(', ')}
                      onChange={e =>
                        updateCurrentAlbum(a => ({
                          ...a,
                          tags: e.target.value
                            .split(/[,，]+/)
                            .map(s => s.trim())
                            .filter(Boolean)
                        }))
                      }
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                    />
                  </div>
                  {currentAlbum.type === 'location' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-gray-400 mb-1">Lat</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={currentAlbum.lat}
                          onChange={e =>
                            updateCurrentAlbum(a => ({
                              ...a,
                              lat: parseFloat(e.target.value) || 0
                            }))
                          }
                          className="w-full px-2 py-1.5 border border-gray-200 rounded font-mono focus:outline-none focus:border-black"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-400 mb-1">Lng</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={currentAlbum.lng}
                          onChange={e =>
                            updateCurrentAlbum(a => ({
                              ...a,
                              lng: parseFloat(e.target.value) || 0
                            }))
                          }
                          className="w-full px-2 py-1.5 border border-gray-200 rounded font-mono focus:outline-none focus:border-black"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Sub-locations chips */}
                {currentAlbum.type === 'location' &&
                  currentAlbum.locations.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-gray-400 mr-1">Points:</span>
                      {currentAlbum.locations.map((loc, lIdx) => (
                        <span
                          key={lIdx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 border border-gray-200 rounded text-gray-600"
                        >
                          {loc.description || `${loc.lat.toFixed(1)},${loc.lng.toFixed(1)}`}
                          <button
                            type="button"
                            onClick={() =>
                              updateCurrentAlbum(a => ({
                                ...a,
                                locations: a.locations.filter((_, i) => i !== lIdx)
                              }))
                            }
                            className="text-gray-400 hover:text-red-600"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                {/* Collapsible Map Picker */}
                {showMapPicker && currentAlbum.type === 'location' && (
                  <ChinaCoordPicker
                    lat={currentAlbum.lat}
                    lng={currentAlbum.lng}
                    locations={currentAlbum.locations}
                    onPickMainCoord={(pickedLat, pickedLng, detectedProv) => {
                      updateCurrentAlbum(a => ({
                        ...a,
                        lat: pickedLat,
                        lng: pickedLng,
                        province: detectedProv || a.province
                      }));
                    }}
                    onAddSubLocation={loc => {
                      updateCurrentAlbum(a => ({
                        ...a,
                        locations: [...a.locations, loc]
                      }));
                    }}
                  />
                )}
              </section>
            ) : (
              currentFolder && (
                <section className="space-y-4">
                  <div className="flex items-baseline justify-between border-b border-gray-100 pb-3">
                    <h2 className="text-2xl font-bold tracking-tight">
                      {currentFolder.title}
                    </h2>
                    <Link
                      href="/folders"
                      target="_blank"
                      className="text-xs font-mono text-gray-400 hover:text-black"
                    >
                      /folders &#8599;
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <label className="block text-gray-400 mb-1">Title</label>
                      <input
                        type="text"
                        value={currentFolder.title}
                        onChange={e =>
                          updateCurrentFolder(f => ({
                            ...f,
                            title: e.target.value as FolderName
                          }))
                        }
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 mb-1">Slug</label>
                      <input
                        type="text"
                        value={currentFolder.slug || ''}
                        onChange={e =>
                          updateCurrentFolder(f => ({ ...f, slug: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded font-mono focus:outline-none focus:border-black"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 mb-1">Date</label>
                      <input
                        type="text"
                        value={currentFolder.date || ''}
                        onChange={e =>
                          updateCurrentFolder(f => ({ ...f, date: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 mb-1">Subtitle</label>
                      <input
                        type="text"
                        value={currentFolder.description || ''}
                        onChange={e =>
                          updateCurrentFolder(f => ({
                            ...f,
                            description: e.target.value
                          }))
                        }
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                      />
                    </div>
                  </div>
                </section>
              )
            )}

            {/* Unified Photos Section */}
            <section className="space-y-4">
              {/* Compact Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-y border-gray-100 text-xs">
                <div className="flex items-center gap-3">
                  <label className="px-3 py-1.5 bg-black hover:bg-gray-800 text-white rounded cursor-pointer transition-colors font-medium">
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploading}
                      onChange={e => handleFileUpload(e.target.files)}
                    />
                    {uploading ? 'Processing...' : '+ Upload Photos'}
                  </label>

                  <div className="flex items-center gap-1">
                    <input
                      type="url"
                      value={manualUrl}
                      onChange={e => setManualUrl(e.target.value)}
                      placeholder="Image URL..."
                      className="w-40 px-2.5 py-1.5 border border-gray-200 rounded font-mono focus:outline-none focus:border-black"
                    />
                    <button
                      type="button"
                      onClick={handleAddManualUrlPhoto}
                      className="px-2.5 py-1.5 border border-gray-200 hover:border-black rounded"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={batchTagInput}
                    onChange={e => setBatchTagInput(e.target.value)}
                    placeholder="Batch tag..."
                    className="w-28 px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                  />
                  <button
                    type="button"
                    onClick={handleBatchAddTag}
                    className="px-2.5 py-1.5 border border-gray-200 hover:border-black rounded"
                  >
                    Tag All
                  </button>
                </div>
              </div>

              {/* Photo Grid */}
              {currentPhotosList.length === 0 ? (
                <div className="py-16 text-center text-gray-300 text-sm">
                  No photos yet
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {currentPhotosList.map((photo, pIdx) => (
                    <div
                      key={photo.id || `${photo.url}-${pIdx}`}
                      className="group border border-gray-100 rounded-lg overflow-hidden flex flex-col justify-between"
                    >
                      <div className="relative aspect-[4/3] bg-gray-50 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.url}
                          alt={photo.title || ''}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                          #{pIdx + 1}
                        </span>
                      </div>

                      <div className="p-2.5 space-y-1.5 text-xs">
                        <input
                          type="text"
                          value={photo.date || ''}
                          onChange={e => {
                            const next = [...currentPhotosList];
                            next[pIdx] = { ...next[pIdx], date: e.target.value };
                            updateCurrentPhotos(next);
                          }}
                          placeholder="Year"
                          className="w-full px-1.5 py-1 border-b border-gray-100 focus:border-black focus:outline-none text-gray-600"
                        />
                        <input
                          type="text"
                          value={(photo.tags || []).join(', ')}
                          onChange={e => {
                            const next = [...currentPhotosList];
                            next[pIdx] = {
                              ...next[pIdx],
                              tags: e.target.value
                                .split(/[,，]+/)
                                .map(s => s.trim())
                                .filter(Boolean)
                            };
                            updateCurrentPhotos(next);
                          }}
                          placeholder="Tags..."
                          className="w-full px-1.5 py-1 border-b border-gray-100 focus:border-black focus:outline-none text-gray-600"
                        />

                        <div className="flex items-center justify-between pt-1 text-[11px] text-gray-400">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={pIdx === 0}
                              onClick={() => {
                                const next = [...currentPhotosList];
                                const [item] = next.splice(pIdx, 1);
                                next.unshift(item);
                                updateCurrentPhotos(next);
                              }}
                              className="hover:text-black disabled:opacity-30"
                            >
                              Top
                            </button>
                            <button
                              type="button"
                              disabled={pIdx === 0}
                              onClick={() => {
                                const next = [...currentPhotosList];
                                const [item] = next.splice(pIdx, 1);
                                next.splice(pIdx - 1, 0, item);
                                updateCurrentPhotos(next);
                              }}
                              className="hover:text-black disabled:opacity-30"
                            >
                              &larr;
                            </button>
                            <button
                              type="button"
                              disabled={pIdx === currentPhotosList.length - 1}
                              onClick={() => {
                                const next = [...currentPhotosList];
                                const [item] = next.splice(pIdx, 1);
                                next.splice(pIdx + 1, 0, item);
                                updateCurrentPhotos(next);
                              }}
                              className="hover:text-black disabled:opacity-30"
                            >
                              &rarr;
                            </button>
                            {isAlbumMode &&
                              photo.exif?.lat !== undefined &&
                              photo.exif?.lng !== undefined && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateCurrentAlbum(a => ({
                                      ...a,
                                      lat: photo.exif!.lat!,
                                      lng: photo.exif!.lng!
                                    }));
                                    showToast('ok', 'GPS applied');
                                  }}
                                  className="hover:text-black"
                                >
                                  GPS
                                </button>
                              )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const next = currentPhotosList.filter(
                                (_, i) => i !== pIdx
                              );
                              updateCurrentPhotos(next);
                            }}
                            className="hover:text-red-600"
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* PROFILE & GIT SECTION */}
        {section === 'profile' && (
          <div className="max-w-xl space-y-8 text-xs">
            <section className="space-y-4">
              <h2 className="text-2xl font-bold tracking-tight border-b border-gray-100 pb-3">
                Profile
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={siteConfig.photographerName}
                    onChange={e =>
                      setSiteConfig({
                        ...siteConfig,
                        photographerName: e.target.value
                      })
                    }
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1">Site Title</label>
                  <input
                    type="text"
                    value={siteConfig.siteTitle}
                    onChange={e =>
                      setSiteConfig({ ...siteConfig, siteTitle: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 mb-1">Subtitle</label>
                  <input
                    type="text"
                    value={siteConfig.subtitle}
                    onChange={e =>
                      setSiteConfig({ ...siteConfig, subtitle: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1">Copyright</label>
                  <input
                    type="text"
                    value={siteConfig.copyrightName || ''}
                    onChange={e =>
                      setSiteConfig({
                        ...siteConfig,
                        copyrightName: e.target.value
                      })
                    }
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Bio I</label>
                <textarea
                  rows={2}
                  value={siteConfig.bioParagraph1}
                  onChange={e =>
                    setSiteConfig({
                      ...siteConfig,
                      bioParagraph1: e.target.value
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Bio II</label>
                <textarea
                  rows={2}
                  value={siteConfig.bioParagraph2}
                  onChange={e =>
                    setSiteConfig({
                      ...siteConfig,
                      bioParagraph2: e.target.value
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                />
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Socials</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSiteConfig({
                        ...siteConfig,
                        socials: [
                          ...siteConfig.socials,
                          { label: 'Link', url: 'https://' }
                        ]
                      })
                    }
                    className="text-gray-400 hover:text-black"
                  >
                    + Add
                  </button>
                </div>
                {siteConfig.socials.map((soc, sIdx) => (
                  <div key={sIdx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={soc.label}
                      onChange={e => {
                        const next = [...siteConfig.socials];
                        next[sIdx] = { ...soc, label: e.target.value };
                        setSiteConfig({ ...siteConfig, socials: next });
                      }}
                      className="w-28 px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                    />
                    <input
                      type="text"
                      value={soc.url}
                      onChange={e => {
                        const next = [...siteConfig.socials];
                        next[sIdx] = { ...soc, url: e.target.value };
                        setSiteConfig({ ...siteConfig, socials: next });
                      }}
                      className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded font-mono focus:outline-none focus:border-black"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = siteConfig.socials.filter(
                          (_, i) => i !== sIdx
                        );
                        setSiteConfig({ ...siteConfig, socials: next });
                      }}
                      className="text-gray-400 hover:text-red-600 px-1"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Minimal Git Commit Section */}
            <section className="space-y-3 pt-4 border-t border-gray-100">
              <span className="block text-gray-400">Git Version</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commitMessage}
                  onChange={e => setCommitMessage(e.target.value)}
                  placeholder="Commit message..."
                  className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-black"
                />
                <button
                  type="button"
                  disabled={committing}
                  onClick={handleGitCommit}
                  className="px-4 py-1.5 bg-black hover:bg-gray-800 text-white rounded transition-colors disabled:opacity-50"
                >
                  Commit
                </button>
              </div>
              <ul className="space-y-1 text-gray-400 font-mono text-[11px] pt-1">
                {gitInfo.commits.slice(0, 5).map(c => (
                  <li key={c.hash} className="flex justify-between">
                    <span className="truncate pr-4">
                      <span className="text-black mr-2">{c.hash}</span>
                      {c.subject}
                    </span>
                    <span className="shrink-0">{c.time}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
