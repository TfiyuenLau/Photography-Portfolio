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

  const pendingChangesCount = gitInfo.changes.length;

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col sm:flex-row">
      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 px-4 py-2 rounded-md text-xs font-medium tracking-tight shadow-sm border transition-all ${
            toast.type === 'ok'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-red-800 text-white border-red-800'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Left Sidebar — Sticky full-height on desktop with pinned top & bottom bars */}
      <aside className="w-full sm:sticky sm:top-0 sm:h-screen sm:w-64 lg:w-72 shrink-0 border-b sm:border-b-0 sm:border-r border-gray-200/80 bg-white/85 backdrop-blur-md flex flex-col">
        {/* Fixed Top Header & Section Switcher */}
        <div className="shrink-0 px-6 pt-6 sm:pt-8 pb-4 border-b border-gray-100 space-y-5">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-900 transition-colors tracking-tight"
            >
              &larr; Home
            </Link>
            <div className="flex items-center gap-2 mt-2">
              <span
                className="w-1.5 h-1.5 rounded-full bg-red-800 shrink-0"
                aria-hidden="true"
              />
              <h1 className="font-bold text-xl tracking-tight text-gray-900 truncate">
                {siteConfig.photographerName}
              </h1>
            </div>
            <p className="text-[11px] uppercase tracking-widest text-gray-400 mt-0.5 pl-3.5">
              Studio
            </p>
          </div>

          {/* Section Switcher */}
          <div className="flex items-center gap-5 text-sm">
            {(
              [
                { id: 'albums', label: 'Albums' },
                { id: 'folders', label: 'Folders' },
                { id: 'profile', label: 'Profile' }
              ] as const
            ).map(tab => {
              const isActive = section === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSection(tab.id)}
                  className={`relative pb-1.5 tracking-tight transition-colors ${
                    isActive
                      ? 'font-semibold text-gray-900'
                      : 'text-gray-400 hover:text-gray-800'
                  }`}
                >
                  {tab.label}
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 right-0 bottom-0 h-[1.5px] rounded-full bg-red-800 transition-opacity duration-200 ${
                      isActive ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Independently Scrollable Middle List */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {/* Item List for Albums */}
          {section === 'albums' && (
            <div className="space-y-3">
              <ul className="space-y-1 text-[15px] tracking-tight">
                {store.albums.map((album, idx) => {
                  const active = idx === selectedAlbumIdx;
                  const count = (store.albumPhotos[album.title] || []).length;
                  return (
                    <li
                      key={`${album.title}-${idx}`}
                      className="group flex items-center justify-between py-1 cursor-pointer"
                      onClick={() => setSelectedAlbumIdx(idx)}
                    >
                      <span
                        className={`inline-flex items-center min-w-0 truncate transition-all duration-200 ease-out ${
                          active
                            ? 'font-semibold text-gray-900'
                            : 'text-gray-400 hover:text-gray-900'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-block h-[1.5px] bg-red-800 rounded-full shrink-0 transition-all duration-200 ease-out ${
                            active
                              ? 'w-3 mr-2 opacity-100'
                              : 'w-0 mr-0 opacity-0'
                          }`}
                        />
                        <span className="truncate">{album.title}</span>
                        <span
                          className={`text-[11px] font-mono font-normal ml-1.5 shrink-0 ${
                            active ? 'text-gray-500' : 'text-gray-300'
                          }`}
                        >
                          {count}
                        </span>
                      </span>

                      <span
                        className="hidden group-hover:flex items-center gap-0.5 text-xs text-gray-400 shrink-0 pl-1"
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          title="Move up"
                          aria-label={`Move ${album.title} up`}
                          onClick={() => handleMoveAlbum(idx, -1)}
                          className="hover:text-gray-900 px-1 py-0.5 rounded"
                        >
                          &uarr;
                        </button>
                        <button
                          type="button"
                          title="Move down"
                          aria-label={`Move ${album.title} down`}
                          onClick={() => handleMoveAlbum(idx, 1)}
                          className="hover:text-gray-900 px-1 py-0.5 rounded"
                        >
                          &darr;
                        </button>
                        <button
                          type="button"
                          title="Delete album"
                          aria-label={`Delete ${album.title}`}
                          onClick={() => handleDeleteAlbum(idx)}
                          className="hover:text-red-700 px-1 py-0.5 rounded"
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
                className="text-xs text-gray-400 hover:text-gray-900 pt-1 transition-colors tracking-tight"
              >
                + New Album
              </button>
            </div>
          )}

          {/* Item List for Folders */}
          {section === 'folders' && (
            <div className="space-y-3">
              <ul className="space-y-1 text-[15px] tracking-tight">
                {store.folders.map((folder, idx) => {
                  const active = idx === selectedFolderIdx;
                  const count = (store.folderPhotos[folder.title] || []).length;
                  return (
                    <li
                      key={`${folder.title}-${idx}`}
                      className="group flex items-center justify-between py-1 cursor-pointer"
                      onClick={() => setSelectedFolderIdx(idx)}
                    >
                      <span
                        className={`inline-flex items-center min-w-0 truncate transition-all duration-200 ease-out ${
                          active
                            ? 'font-semibold text-gray-900'
                            : 'text-gray-400 hover:text-gray-900'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-block h-[1.5px] bg-red-800 rounded-full shrink-0 transition-all duration-200 ease-out ${
                            active
                              ? 'w-3 mr-2 opacity-100'
                              : 'w-0 mr-0 opacity-0'
                          }`}
                        />
                        <span className="truncate">{folder.title}</span>
                        <span
                          className={`text-[11px] font-mono font-normal ml-1.5 shrink-0 ${
                            active ? 'text-gray-500' : 'text-gray-300'
                          }`}
                        >
                          {count}
                        </span>
                      </span>
                      {store.folders.length > 1 && (
                        <button
                          type="button"
                          title="Delete folder"
                          aria-label={`Delete ${folder.title}`}
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteFolder(idx);
                          }}
                          className="hidden group-hover:inline text-xs text-gray-400 hover:text-red-700 px-1 py-0.5 rounded shrink-0"
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
                className="text-xs text-gray-400 hover:text-gray-900 pt-1 transition-colors tracking-tight"
              >
                + New Folder
              </button>
            </div>
          )}

          {/* Contextual Info for Profile */}
          {section === 'profile' && (
            <div className="space-y-3 text-xs text-gray-400 leading-relaxed">
              <p className="text-gray-500 font-medium tracking-tight">
                Site &amp; Version Settings
              </p>
              <p>
                Edit portfolio identity, biography, and social links, or create
                a local Git snapshot of your changes.
              </p>
              <div className="pt-2 border-t border-gray-100 space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <span>Albums</span>
                  <span className="text-gray-700">{store.albums.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Folders</span>
                  <span className="text-gray-700">{store.folders.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Git Changes</span>
                  <span
                    className={
                      pendingChangesCount > 0
                        ? 'text-red-800 font-semibold'
                        : 'text-gray-700'
                    }
                  >
                    {pendingChangesCount}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Permanently Pinned Bottom Action Bar */}
        <div className="shrink-0 px-6 py-4 border-t border-gray-200/80 bg-white/95 backdrop-blur-sm space-y-2.5">
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="w-full py-2 bg-gray-900 hover:bg-black text-white text-xs font-medium tracking-tight rounded-md transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <div className="flex items-center justify-between text-xs text-gray-500 pt-0.5">
            <button
              type="button"
              onClick={handleGitCommit}
              disabled={committing}
              className="inline-flex items-center gap-1.5 hover:text-gray-900 transition-colors disabled:opacity-50"
            >
              <span>{committing ? 'Committing...' : 'Git Snapshot'}</span>
              {pendingChangesCount > 0 && (
                <span
                  title={`${pendingChangesCount} uncommitted change${pendingChangesCount === 1 ? '' : 's'}`}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-800/10 text-red-800 font-mono text-[10px] font-medium leading-none"
                >
                  <span
                    className="w-1 h-1 rounded-full bg-red-800"
                    aria-hidden="true"
                  />
                  {pendingChangesCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="text-gray-400 hover:text-gray-900 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area — Full available workspace width */}
      <main className="flex-1 min-w-0 w-full px-6 py-8 sm:px-10 lg:px-12 xl:px-16 space-y-8">
        {/* ALBUMS OR FOLDERS WORKSPACE */}
        {(section === 'albums' || section === 'folders') && (
          <>
            {/* Metadata Section */}
            {isAlbumMode && currentAlbum ? (
              <section className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 pb-3.5">
                  <div className="flex items-baseline gap-3 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full bg-red-800 shrink-0 self-center"
                      aria-hidden="true"
                    />
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900 truncate">
                      {currentAlbum.title}
                    </h2>
                    <Link
                      href={`/${titleToSlug(currentAlbum.title, currentAlbum.slug)}`}
                      target="_blank"
                      className="text-xs font-mono text-gray-400 hover:text-gray-900 transition-colors shrink-0"
                    >
                      /{titleToSlug(currentAlbum.title, currentAlbum.slug)} &#8599;
                    </Link>
                    <span className="text-xs font-mono text-gray-400 shrink-0">
                      {currentPhotosList.length} photos
                    </span>
                  </div>

                  {currentAlbum.type === 'location' && (
                    <button
                      type="button"
                      onClick={() => setShowMapPicker(v => !v)}
                      className={`text-xs px-3 py-1.5 border rounded-md transition-colors tracking-tight ${
                        showMapPicker
                          ? 'border-red-800 text-red-800 bg-red-800/5'
                          : 'border-gray-200/80 text-gray-600 hover:border-gray-900 hover:text-gray-900'
                      }`}
                    >
                      {showMapPicker ? 'Hide Map Picker' : 'Map Picker'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
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
                      className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
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
                      className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md font-mono focus:outline-none focus:border-gray-900 transition-colors"
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
                      className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md bg-white focus:outline-none focus:border-gray-900 transition-colors"
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
                      className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
                    />
                  </div>
                </div>

                <div
                  className={`grid gap-4 text-xs ${
                    currentAlbum.type === 'location'
                      ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
                      : 'grid-cols-1 sm:grid-cols-2'
                  }`}
                >
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
                      className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
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
                      className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
                    />
                  </div>
                  {currentAlbum.type === 'location' && (
                    <>
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
                          className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md font-mono focus:outline-none focus:border-gray-900 transition-colors"
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
                          className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md font-mono focus:outline-none focus:border-gray-900 transition-colors"
                        />
                      </div>
                    </>
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
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 border border-gray-200/80 rounded-full text-gray-600 bg-gray-50/50"
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
                            className="text-gray-400 hover:text-red-700"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                {/* Collapsible Map Picker */}
                {showMapPicker && currentAlbum.type === 'location' && (
                  <div className="border border-gray-200/80 rounded-lg p-3 bg-white">
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
                  </div>
                )}
              </section>
            ) : (
              currentFolder && (
                <section className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 pb-3.5">
                    <div className="flex items-baseline gap-3 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full bg-red-800 shrink-0 self-center"
                        aria-hidden="true"
                      />
                      <h2 className="text-2xl font-bold tracking-tight text-gray-900 truncate">
                        {currentFolder.title}
                      </h2>
                      <Link
                        href="/folders"
                        target="_blank"
                        className="text-xs font-mono text-gray-400 hover:text-gray-900 transition-colors shrink-0"
                      >
                        /folders &#8599;
                      </Link>
                      <span className="text-xs font-mono text-gray-400 shrink-0">
                        {currentPhotosList.length} photos
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
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
                        className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
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
                        className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md font-mono focus:outline-none focus:border-gray-900 transition-colors"
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
                        className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
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
                        className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
                      />
                    </div>
                  </div>
                </section>
              )
            )}

            {/* Unified Photos Section */}
            <section className="space-y-5">
              {/* Compact Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-y border-gray-200/80 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="px-3.5 py-1.5 bg-gray-900 hover:bg-black text-white rounded-md cursor-pointer transition-colors font-medium tracking-tight">
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

                  <div className="flex items-center gap-1.5">
                    <input
                      type="url"
                      value={manualUrl}
                      onChange={e => setManualUrl(e.target.value)}
                      placeholder="Image URL..."
                      className="w-48 sm:w-56 px-2.5 py-1.5 border border-gray-200/80 rounded-md font-mono focus:outline-none focus:border-gray-900 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={handleAddManualUrlPhoto}
                      className="px-3 py-1.5 border border-gray-200/80 hover:border-gray-900 text-gray-700 hover:text-gray-900 rounded-md transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={batchTagInput}
                    onChange={e => setBatchTagInput(e.target.value)}
                    placeholder="Batch tag..."
                    className="w-32 sm:w-40 px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={handleBatchAddTag}
                    className="px-3 py-1.5 border border-gray-200/80 hover:border-gray-900 text-gray-700 hover:text-gray-900 rounded-md transition-colors"
                  >
                    Tag All
                  </button>
                </div>
              </div>

              {/* Responsive Photo Grid */}
              {currentPhotosList.length === 0 ? (
                <div className="py-20 text-center text-gray-300 text-sm border border-dashed border-gray-200/80 rounded-lg">
                  No photos yet
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                  {currentPhotosList.map((photo, pIdx) => (
                    <div
                      key={photo.id || `${photo.url}-${pIdx}`}
                      className="group border border-gray-200/80 hover:border-gray-300 rounded-lg overflow-hidden flex flex-col justify-between bg-white transition-colors"
                    >
                      <div className="relative aspect-[4/3] bg-gray-50 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.url}
                          alt={photo.title || ''}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                        <span className="absolute top-1.5 left-1.5 bg-black/65 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
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
                          className="w-full px-1.5 py-1 border-b border-gray-100 focus:border-gray-900 focus:outline-none text-gray-700 font-mono text-[11px]"
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
                          className="w-full px-1.5 py-1 border-b border-gray-100 focus:border-gray-900 focus:outline-none text-gray-600 text-[11px]"
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
                              className="hover:text-gray-900 disabled:opacity-30 transition-colors"
                            >
                              Top
                            </button>
                            <button
                              type="button"
                              disabled={pIdx === 0}
                              aria-label="Move left"
                              onClick={() => {
                                const next = [...currentPhotosList];
                                const [item] = next.splice(pIdx, 1);
                                next.splice(pIdx - 1, 0, item);
                                updateCurrentPhotos(next);
                              }}
                              className="hover:text-gray-900 disabled:opacity-30 transition-colors"
                            >
                              &larr;
                            </button>
                            <button
                              type="button"
                              disabled={pIdx === currentPhotosList.length - 1}
                              aria-label="Move right"
                              onClick={() => {
                                const next = [...currentPhotosList];
                                const [item] = next.splice(pIdx, 1);
                                next.splice(pIdx + 1, 0, item);
                                updateCurrentPhotos(next);
                              }}
                              className="hover:text-gray-900 disabled:opacity-30 transition-colors"
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
                                  className="hover:text-red-800 transition-colors"
                                >
                                  GPS
                                </button>
                              )}
                          </div>

                          <button
                            type="button"
                            aria-label="Remove photo"
                            onClick={() => {
                              const next = currentPhotosList.filter(
                                (_, i) => i !== pIdx
                              );
                              updateCurrentPhotos(next);
                            }}
                            className="hover:text-red-700 transition-colors px-0.5"
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

        {/* PROFILE & GIT SECTION — Balanced two-column layout on wide screens */}
        {section === 'profile' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-200/80 pb-3.5">
              <span
                className="w-2 h-2 rounded-full bg-red-800 shrink-0"
                aria-hidden="true"
              />
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                Profile &amp; Git
              </h2>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-10 text-xs items-start">
              {/* Left Column: Site Identity & Socials */}
              <section className="xl:col-span-7 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
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
                      className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 mb-1">Subtitle</label>
                    <input
                      type="text"
                      value={siteConfig.subtitle}
                      onChange={e =>
                        setSiteConfig({ ...siteConfig, subtitle: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
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
                      className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-400 mb-1">Bio I</label>
                  <textarea
                    rows={3}
                    value={siteConfig.bioParagraph1}
                    onChange={e =>
                      setSiteConfig({
                        ...siteConfig,
                        bioParagraph1: e.target.value
                      })
                    }
                    className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 mb-1">Bio II</label>
                  <textarea
                    rows={3}
                    value={siteConfig.bioParagraph2}
                    onChange={e =>
                      setSiteConfig({
                        ...siteConfig,
                        bioParagraph2: e.target.value
                      })
                    }
                    className="w-full px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
                  />
                </div>

                <div className="space-y-2.5 pt-2">
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
                      className="text-gray-400 hover:text-gray-900 transition-colors"
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
                        className="w-32 px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
                      />
                      <input
                        type="text"
                        value={soc.url}
                        onChange={e => {
                          const next = [...siteConfig.socials];
                          next[sIdx] = { ...soc, url: e.target.value };
                          setSiteConfig({ ...siteConfig, socials: next });
                        }}
                        className="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200/80 rounded-md font-mono focus:outline-none focus:border-gray-900 transition-colors"
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${soc.label}`}
                        onClick={() => {
                          const next = siteConfig.socials.filter(
                            (_, i) => i !== sIdx
                          );
                          setSiteConfig({ ...siteConfig, socials: next });
                        }}
                        className="text-gray-400 hover:text-red-700 px-1.5 py-1 transition-colors"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Right Column: Git Version & Working Tree Panel */}
              <section className="xl:col-span-5 border border-gray-200/80 rounded-lg p-5 bg-white/85 backdrop-blur-md space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <span className="font-semibold text-sm tracking-tight text-gray-900">
                    Git Version
                  </span>
                  <span
                    className={`font-mono text-[11px] px-2 py-0.5 rounded-full ${
                      pendingChangesCount > 0
                        ? 'bg-red-800/10 text-red-800'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {pendingChangesCount > 0
                      ? `${pendingChangesCount} pending`
                      : 'Clean'}
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={e => setCommitMessage(e.target.value)}
                    placeholder="Commit message..."
                    className="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200/80 rounded-md focus:outline-none focus:border-gray-900 transition-colors"
                  />
                  <button
                    type="button"
                    disabled={committing}
                    onClick={handleGitCommit}
                    className="px-4 py-1.5 bg-gray-900 hover:bg-black text-white rounded-md font-medium tracking-tight transition-colors disabled:opacity-50 shrink-0"
                  >
                    {committing ? 'Committing...' : 'Commit'}
                  </button>
                </div>

                {pendingChangesCount > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="block text-[11px] uppercase tracking-wider text-gray-400">
                      Working Tree
                    </span>
                    <ul className="max-h-36 overflow-y-auto space-y-1 font-mono text-[11px] text-gray-600 bg-gray-50/70 border border-gray-100 rounded-md p-2.5">
                      {gitInfo.changes.map((line, idx) => (
                        <li key={idx} className="truncate">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-1.5 pt-1">
                  <span className="block text-[11px] uppercase tracking-wider text-gray-400">
                    Recent Commits
                  </span>
                  <ul className="space-y-1.5 text-gray-500 font-mono text-[11px]">
                    {gitInfo.commits.slice(0, 6).map(c => (
                      <li
                        key={c.hash}
                        className="flex items-baseline justify-between gap-3 py-0.5 border-b border-gray-50 last:border-b-0"
                      >
                        <span className="truncate">
                          <span className="text-gray-900 font-medium mr-2">
                            {c.hash}
                          </span>
                          {c.subject}
                        </span>
                        <span className="shrink-0 text-gray-400">{c.time}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
