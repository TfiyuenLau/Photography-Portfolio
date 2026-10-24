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
  const [activeTab, setActiveTab] = useState<'albums' | 'photos' | 'folders' | 'settings'>('albums');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [store, setStore] = useState<PortfolioStore | null>(null);
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);

  const [selectedAlbumIdx, setSelectedAlbumIdx] = useState(0);
  const [photoTargetType, setPhotoTargetType] = useState<'album' | 'folder'>('album');
  const [selectedFolderIdx, setSelectedFolderIdx] = useState(0);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadDefaultTags, setUploadDefaultTags] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [batchTagInput, setBatchTagInput] = useState('');

  // Git state
  const [gitInfo, setGitInfo] = useState<GitStatusInfo>({ changes: [], commits: [] });
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);

  const showToast = useCallback((type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    setTimeout(() => {
      setToast(prev => (prev?.text === text ? null : prev));
    }, 4000);
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
        showToast('err', data.message || '加载数据失败');
      }
    } catch {
      showToast('err', '无法连接后台接口');
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
      // Normalize order numbers
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
        showToast('ok', '已成功保存所有修改！前台页面已实时生效');
        fetchGitInfo();
      } else {
        showToast('err', data.message || '保存失败');
      }
    } catch {
      showToast('err', '保存请求异常');
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
      <main className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500 text-sm">
        正在加载作品集管理工作台...
      </main>
    );
  }

  const currentAlbum = store.albums[selectedAlbumIdx] || store.albums[0];
  const currentFolder = store.folders[selectedFolderIdx] || store.folders[0];

  const currentPhotosKey =
    photoTargetType === 'album' ? currentAlbum?.title : currentFolder?.title;
  const currentPhotosList: Photo[] =
    photoTargetType === 'album'
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

  function handleAddAlbum() {
    if (!store) return;
    const newTitle = `新相册 Album ${store.albums.length + 1}` as AlbumTitle;
    const newAlbum: Album = {
      title: newTitle,
      slug: `album-${store.albums.length + 1}`,
      province: '北京',
      color: '#880808',
      type: 'location',
      description: '城市与风光纪实',
      date: `${new Date().getFullYear()}.01`,
      lat: 39.9042,
      lng: 116.4074,
      locations: [],
      tags: ['新相册', new Date().getFullYear().toString()],
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
    if (!store || store.albums.length <= 1) {
      showToast('err', '至少需保留一个相册');
      return;
    }
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

  function updateCurrentPhotos(newPhotos: Photo[]) {
    if (!store || !currentPhotosKey) return;
    if (photoTargetType === 'album') {
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
        uploadDefaultTags,
        photoTargetType === 'album' ? currentAlbum?.province || '' : '',
        photoTargetType === 'album' ? (currentAlbum?.tags || []).join(',') : ''
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
        showToast('ok', data.message || `已上传并自动转为 WebP (${data.photos.length} 张)`);
      } else {
        showToast('err', data.message || '上传失败');
      }
    } catch {
      showToast('err', '上传处理异常');
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
      tags:
        photoTargetType === 'album'
          ? [...(currentAlbum?.tags || [])]
          : ['精选'],
      size: 350000,
      url: manualUrl.trim(),
      width: 3000,
      height: 2000
    };
    updateCurrentPhotos([newPhoto, ...currentPhotosList]);
    setManualUrl('');
    showToast('ok', '已添加外部图片链接，请点击右上角【保存全部修改】持久化');
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
    showToast('ok', `已为当前列表 ${updated.length} 张照片批量添加标签 #${clean}`);
  }

  async function handleGitCommit() {
    setCommitting(true);
    try {
      // First save current state to disk
      await handleSaveAll();
      const res = await fetch('/api/admin/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message:
            commitMessage.trim() ||
            `content: update portfolio (${new Date().toLocaleDateString('zh-CN')})`
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('ok', data.message);
        setCommitMessage('');
        fetchGitInfo();
      } else {
        showToast('err', data.message || 'Git 提交失败');
      }
    } catch {
      showToast('err', '执行 Git 命令失败');
    } finally {
      setCommitting(false);
    }
  }

  // Compute global tag summary
  const globalTagMap = new Map<string, number>();
  for (const album of store.albums) {
    const pList = store.albumPhotos[album.title] || [];
    for (const t of album.tags || []) {
      globalTagMap.set(t, (globalTagMap.get(t) || 0) + pList.length);
    }
    for (const p of pList) {
      for (const pt of p.tags || []) {
        if (!(album.tags || []).includes(pt)) {
          globalTagMap.set(pt, (globalTagMap.get(pt) || 0) + 1);
        }
      }
    }
  }
  const allGlobalTags = Array.from(globalTagMap.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-red-700" />
            <span className="font-bold text-lg tracking-tight">
              {siteConfig.photographerName} · 作品集管理工作台
            </span>
          </div>
          <span className="text-xs px-2 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-500">
            纯静态安全模式 (本地直写)
          </span>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg text-sm">
          {[
            { id: 'albums', label: `1. 相册与地图选点 (${store.albums.length})` },
            { id: 'photos', label: '2. 照片上传与标签管理' },
            { id: 'folders', label: `3. 专题归档与标签库 (${store.folders.length})` },
            { id: 'settings', label: '4. 个人品牌与 Git 版本保存' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 font-medium shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            target="_blank"
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
          >
            预览前台首页 ↗
          </Link>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="px-4 py-1.5 text-xs font-medium bg-red-700 hover:bg-red-800 text-white rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            {saving ? '正在保存...' : '保存全部修改'}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-700"
          >
            退出
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
            toast.type === 'ok'
              ? 'bg-gray-900 text-white border-gray-800'
              : 'bg-red-600 text-white border-red-700'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {/* TAB 1: ALBUMS & CHINA MAP COORDINATE PICKER */}
        {activeTab === 'albums' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Sidebar: Album List */}
            <aside className="lg:col-span-3 bg-white border border-gray-200 rounded-xl p-4 h-fit space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm text-gray-700">
                  相册列表 (首页导航排序)
                </h2>
                <button
                  type="button"
                  onClick={handleAddAlbum}
                  className="px-2.5 py-1 text-xs bg-gray-900 hover:bg-red-700 text-white rounded-md transition-colors"
                >
                  + 新建相册
                </button>
              </div>

              <ul className="space-y-1.5">
                {store.albums.map((album, idx) => {
                  const isSelected = idx === selectedAlbumIdx;
                  const count = (store.albumPhotos[album.title] || []).length;
                  return (
                    <li
                      key={`${album.title}-${idx}`}
                      className={`group flex items-center justify-between px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-red-50/70 border-red-300 text-red-900 font-medium'
                          : 'bg-white border-gray-100 hover:bg-gray-50 text-gray-700'
                      }`}
                      onClick={() => setSelectedAlbumIdx(idx)}
                    >
                      <div className="truncate pr-2">
                        <span>{album.title}</span>
                        <span className="ml-1.5 text-xs text-gray-400">
                          ({count}张)
                        </span>
                      </div>
                      <div
                        className="flex items-center gap-1 opacity-70 group-hover:opacity-100"
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleMoveAlbum(idx, -1)}
                          title="上移"
                          className="px-1 text-xs hover:text-black"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveAlbum(idx, 1)}
                          title="下移"
                          className="px-1 text-xs hover:text-black"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAlbum(idx)}
                          title="删除相册"
                          className="px-1 text-xs text-gray-400 hover:text-red-600"
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </aside>

            {/* Right Area: Album Metadata & Interactive Map */}
            {currentAlbum && (
              <section className="lg:col-span-9 bg-white border border-gray-200 rounded-xl p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      编辑相册：{currentAlbum.title}
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      前台访问路径：
                      <Link
                        href={`/${titleToSlug(currentAlbum.title, currentAlbum.slug)}`}
                        target="_blank"
                        className="text-red-700 underline ml-1"
                      >
                        /{titleToSlug(currentAlbum.title, currentAlbum.slug)}
                      </Link>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPhotoTargetType('album');
                      setActiveTab('photos');
                    }}
                    className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium"
                  >
                    管理此相册的照片 ({(store.albumPhotos[currentAlbum.title] || []).length} 张) →
                  </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                  {/* Form Fields */}
                  <div className="xl:col-span-5 space-y-4 text-sm">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        相册标题 (支持中文或中英双语)
                      </label>
                      <input
                        type="text"
                        value={currentAlbum.title}
                        onChange={e =>
                          updateCurrentAlbum(a => ({
                            ...a,
                            title: e.target.value as AlbumTitle
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          路由别名 (URL Slug)
                        </label>
                        <input
                          type="text"
                          value={currentAlbum.slug || ''}
                          onChange={e =>
                            updateCurrentAlbum(a => ({
                              ...a,
                              slug: e.target.value
                            }))
                          }
                          placeholder="如 hong-kong"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          相册类型
                        </label>
                        <select
                          value={currentAlbum.type}
                          onChange={e =>
                            updateCurrentAlbum(a => ({
                              ...a,
                              type: e.target.value as 'location' | 'custom'
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                        >
                          <option value="location">地理坐标相册 (地图定点)</option>
                          <option value="custom">非地域专题相册 (全图涟漪)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          关联高亮省份/区域
                        </label>
                        <input
                          type="text"
                          value={currentAlbum.province || ''}
                          onChange={e =>
                            updateCurrentAlbum(a => ({
                              ...a,
                              province: e.target.value
                            }))
                          }
                          placeholder="如：香港 / 台湾 / 四川"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          拍摄日期 / 时间跨度
                        </label>
                        <input
                          type="text"
                          value={currentAlbum.date || ''}
                          onChange={e =>
                            updateCurrentAlbum(a => ({
                              ...a,
                              date: e.target.value || null
                            }))
                          }
                          placeholder="如 2024.11"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        副标题 / 城市简述
                      </label>
                      <input
                        type="text"
                        value={currentAlbum.description || ''}
                        onChange={e =>
                          updateCurrentAlbum(a => ({
                            ...a,
                            description: e.target.value || null
                          }))
                        }
                        placeholder="如：维多利亚港 · 中环 · 旺角"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        相册标签 (用逗号分隔，支持按地域/题材/年份检索)
                      </label>
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
                        placeholder="香港, 街头, 夜景, 2024"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>

                    {currentAlbum.type === 'location' && (
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            主纬度 (Latitude °N)
                          </label>
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            主经度 (Longitude °E)
                          </label>
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Interactive Greater China Map Coordinate Picker */}
                  <div className="xl:col-span-7 space-y-4">
                    <ChinaCoordPicker
                      lat={currentAlbum.lat}
                      lng={currentAlbum.lng}
                      locations={currentAlbum.locations}
                      onPickMainCoord={(pickedLat, pickedLng, detectedProv) => {
                        updateCurrentAlbum(a => ({
                          ...a,
                          type: 'location',
                          lat: pickedLat,
                          lng: pickedLng,
                          province: detectedProv || a.province
                        }));
                        showToast(
                          'ok',
                          `已拾取主坐标：${pickedLat}°N, ${pickedLng}°E${
                            detectedProv ? ` (${detectedProv})` : ''
                          }`
                        );
                      }}
                      onAddSubLocation={loc => {
                        updateCurrentAlbum(a => ({
                          ...a,
                          locations: [...a.locations, loc]
                        }));
                        showToast('ok', `已添加子拍摄点：${loc.description}`);
                      }}
                    />

                    {/* Sub-locations list */}
                    <div className="border border-gray-200 rounded-xl p-4 bg-white">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-700">
                          子拍摄地点列表 ({currentAlbum.locations.length})
                        </span>
                        <span className="text-[11px] text-gray-400">
                          切至上方「点击添加子地点」在地图上点选即可新增
                        </span>
                      </div>

                      {currentAlbum.locations.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">
                          暂无子地点，可在上方地图切换至“点击添加子地点”模式点选添加。
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-44 overflow-y-auto">
                          {currentAlbum.locations.map((loc, lIdx) => (
                            <div
                              key={lIdx}
                              className="flex items-center gap-2 text-xs bg-gray-50 p-2 rounded-lg border border-gray-200"
                            >
                              <input
                                type="text"
                                value={loc.description || ''}
                                onChange={e => {
                                  const nextLocs = [...currentAlbum.locations];
                                  nextLocs[lIdx] = {
                                    ...nextLocs[lIdx],
                                    description: e.target.value
                                  };
                                  updateCurrentAlbum(a => ({
                                    ...a,
                                    locations: nextLocs
                                  }));
                                }}
                                placeholder="地点名称"
                                className="px-2 py-1 border border-gray-300 rounded bg-white w-36"
                              />
                              <input
                                type="text"
                                value={loc.date || ''}
                                onChange={e => {
                                  const nextLocs = [...currentAlbum.locations];
                                  nextLocs[lIdx] = {
                                    ...nextLocs[lIdx],
                                    date: e.target.value
                                  };
                                  updateCurrentAlbum(a => ({
                                    ...a,
                                    locations: nextLocs
                                  }));
                                }}
                                placeholder="年份 (如 2024)"
                                className="px-2 py-1 border border-gray-300 rounded bg-white w-20"
                              />
                              <span className="font-mono text-gray-400 flex-1">
                                {loc.lat.toFixed(2)}°N, {loc.lng.toFixed(2)}°E
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextLocs = currentAlbum.locations.filter(
                                    (_, i) => i !== lIdx
                                  );
                                  updateCurrentAlbum(a => ({
                                    ...a,
                                    locations: nextLocs
                                  }));
                                }}
                                className="text-red-600 hover:underline px-1"
                              >
                                删除
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {/* TAB 2: PHOTOS UPLOAD, AUTO-WEBP & TAGS MANAGER */}
        {activeTab === 'photos' && (
          <div className="space-y-6">
            {/* Target Selector Bar */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-gray-700">
                  选择要管理照片的集合：
                </span>
                <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-100 text-xs">
                  <button
                    type="button"
                    onClick={() => setPhotoTargetType('album')}
                    className={`px-3 py-1 rounded-md ${
                      photoTargetType === 'album'
                        ? 'bg-white font-medium shadow-sm'
                        : 'text-gray-600'
                    }`}
                  >
                    相册 (Albums)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoTargetType('folder')}
                    className={`px-3 py-1 rounded-md ${
                      photoTargetType === 'folder'
                        ? 'bg-white font-medium shadow-sm'
                        : 'text-gray-600'
                    }`}
                  >
                    专题归档 (Folders)
                  </button>
                </div>

                {photoTargetType === 'album' ? (
                  <select
                    value={selectedAlbumIdx}
                    onChange={e => setSelectedAlbumIdx(Number(e.target.value))}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white font-medium"
                  >
                    {store.albums.map((a, idx) => (
                      <option key={a.title} value={idx}>
                        {a.title} ({(store.albumPhotos[a.title] || []).length} 张)
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={selectedFolderIdx}
                    onChange={e => setSelectedFolderIdx(Number(e.target.value))}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white font-medium"
                  >
                    {store.folders.map((f, idx) => (
                      <option key={f.title} value={idx}>
                        {f.title} ({(store.folderPhotos[f.title] || []).length} 张)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Batch Add Tag */}
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="text"
                  value={batchTagInput}
                  onChange={e => setBatchTagInput(e.target.value)}
                  placeholder="输入标签名 (如: 胶片 / 2025)"
                  className="px-3 py-1.5 border border-gray-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={handleBatchAddTag}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-black text-white rounded-lg"
                >
                  为本集全部照片批量加标签
                </button>
              </div>
            </div>

            {/* Drag and Drop Auto-WebP Uploader */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-white border-2 border-dashed border-gray-300 hover:border-red-600 rounded-xl p-6 transition-colors flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-gray-800">
                      批量上传原图（自动转高画质 WebP + 自动提取 EXIF / GPS）
                    </span>
                    <span className="text-xs text-red-700 font-medium">
                      内置 Sharp 引擎 · 无需运行命令行脚本
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    支持拖拽多张 JPG / PNG / WEBP 原图，系统会自动等比缩放到 2048px 内、压制为 WebP 保存至{' '}
                    <code className="bg-gray-100 px-1 rounded">public/photos/</code>，并自动提取宽高、相机参数与拍摄经纬度。
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-600 whitespace-nowrap">
                      上传默认附加标签：
                    </span>
                    <input
                      type="text"
                      value={uploadDefaultTags}
                      onChange={e => setUploadDefaultTags(e.target.value)}
                      placeholder="例如：香港, 夜景, 街头（选填，用逗号分隔）"
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg"
                    />
                  </div>

                  <label className="block w-full py-5 bg-gray-50 hover:bg-red-50/40 border border-gray-200 rounded-lg text-center cursor-pointer transition-colors">
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploading}
                      onChange={e => handleFileUpload(e.target.files)}
                    />
                    <span className="text-sm font-medium text-gray-700">
                      {uploading
                        ? '正在高速压制 WebP 并解析 EXIF...'
                        : '点击选择多张照片 或 将照片拖拽至此区域上传'}
                    </span>
                  </label>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white border border-gray-200 rounded-xl p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 mb-2">
                    方式二：通过外部图床 / CDN 链接添加
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    如果您有部分照片托管在外部 CDN 或对象存储，也可以直接粘贴图片 URL 添加到当前相册。
                  </p>
                </div>
                <div className="space-y-3">
                  <input
                    type="url"
                    value={manualUrl}
                    onChange={e => setManualUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddManualUrlPhoto}
                    className="w-full py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-medium rounded-lg"
                  >
                    + 添加图片 URL 至当前集合
                  </button>
                </div>
              </div>
            </div>

            {/* Photos Grid List */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-base text-gray-900">
                  「{currentPhotosKey}」中的照片 ({currentPhotosList.length} 张)
                </h3>
                <span className="text-xs text-gray-400">
                  修改标签或顺序后，请点击右上角【保存全部修改】
                </span>
              </div>

              {currentPhotosList.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm">
                  当前集合暂无照片，请使用上方上传器上传照片。
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {currentPhotosList.map((photo, pIdx) => (
                    <div
                      key={photo.id || `${photo.url}-${pIdx}`}
                      className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 flex flex-col justify-between"
                    >
                      <div className="relative aspect-[4/3] bg-gray-200 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.url}
                          alt={photo.title || ''}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-2 left-2 bg-black/65 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                          #{pIdx + 1} · {photo.width}×{photo.height} ({Math.round(photo.size / 1024)}KB)
                        </span>
                      </div>

                      <div className="p-3 space-y-2 text-xs">
                        {photo.exif && (
                          <div className="bg-white border border-gray-200 rounded p-1.5 text-[11px] text-gray-500 font-mono">
                            <div>
                              {[
                                photo.exif.camera,
                                photo.exif.focalLength,
                                photo.exif.aperture,
                                photo.exif.shutterSpeed,
                                photo.exif.iso ? `ISO${photo.exif.iso}` : undefined
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'EXIF 已读取'}
                            </div>
                            {photo.exif.lat !== undefined && photo.exif.lng !== undefined && (
                              <div className="flex items-center justify-between mt-1 text-red-700">
                                <span>
                                  GPS: {photo.exif.lat}°N, {photo.exif.lng}°E
                                </span>
                                {photoTargetType === 'album' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      updateCurrentAlbum(a => ({
                                        ...a,
                                        lat: photo.exif!.lat!,
                                        lng: photo.exif!.lng!
                                      }));
                                      showToast('ok', '已将照片 EXIF 经纬度设为相册主坐标！');
                                    }}
                                    className="underline font-sans"
                                  >
                                    设为相册坐标
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-400 w-10">年份:</span>
                          <input
                            type="text"
                            value={photo.date || ''}
                            onChange={e => {
                              const next = [...currentPhotosList];
                              next[pIdx] = { ...next[pIdx], date: e.target.value };
                              updateCurrentPhotos(next);
                            }}
                            placeholder="如 2024"
                            className="flex-1 px-2 py-1 border border-gray-300 rounded bg-white"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-400 w-10">标签:</span>
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
                            placeholder="香港, 夜景, 2024"
                            className="flex-1 px-2 py-1 border border-gray-300 rounded bg-white"
                          />
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-gray-200 text-gray-500">
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
                              className="px-1.5 py-0.5 bg-white border border-gray-200 rounded hover:text-black disabled:opacity-40"
                            >
                              置顶
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
                              className="px-1.5 py-0.5 bg-white border border-gray-200 rounded hover:text-black disabled:opacity-40"
                            >
                              ←
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
                              className="px-1.5 py-0.5 bg-white border border-gray-200 rounded hover:text-black disabled:opacity-40"
                            >
                              →
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const next = currentPhotosList.filter((_, i) => i !== pIdx);
                              updateCurrentPhotos(next);
                            }}
                            className="text-red-600 hover:underline"
                          >
                            移除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: FOLDERS & GLOBAL TAG LIBRARY */}
        {activeTab === 'folders' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-lg text-gray-900">
                    专题归档管理 (/folders)
                  </h2>
                  <p className="text-xs text-gray-400">
                    采用等高渐进式网格 (Pig Grid) 展示的专题摄影合集
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newTitle = `新专题 Folder ${store.folders.length + 1}` as FolderName;
                    const newFolder: Folder = {
                      title: newTitle,
                      slug: `folder-${store.folders.length + 1}`,
                      parentTitle: null,
                      description: '专题影像档案',
                      date: '2024-2025',
                      order: store.folders.length + 1
                    };
                    setStore({
                      ...store,
                      folders: [...store.folders, newFolder],
                      folderPhotos: { ...store.folderPhotos, [newTitle]: [] }
                    });
                  }}
                  className="px-3 py-1.5 text-xs bg-gray-900 hover:bg-red-700 text-white rounded-lg"
                >
                  + 新增专题目录
                </button>
              </div>

              <div className="space-y-3">
                {store.folders.map((folder, fIdx) => (
                  <div
                    key={fIdx}
                    className="border border-gray-200 rounded-xl p-4 bg-gray-50/60 space-y-3 text-sm"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          专题名称
                        </label>
                        <input
                          type="text"
                          value={folder.title}
                          onChange={e => {
                            const oldTitle = folder.title;
                            const newTitle = e.target.value as FolderName;
                            const nextFolders = [...store.folders];
                            nextFolders[fIdx] = { ...folder, title: newTitle };
                            const nextPhotos = { ...store.folderPhotos };
                            if (oldTitle !== newTitle) {
                              nextPhotos[newTitle] = nextPhotos[oldTitle] || [];
                              delete nextPhotos[oldTitle];
                            }
                            setStore({
                              ...store,
                              folders: nextFolders,
                              folderPhotos: nextPhotos
                            });
                          }}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          路由 Slug
                        </label>
                        <input
                          type="text"
                          value={folder.slug || ''}
                          onChange={e => {
                            const nextFolders = [...store.folders];
                            nextFolders[fIdx] = { ...folder, slug: e.target.value };
                            setStore({ ...store, folders: nextFolders });
                          }}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          时间范围
                        </label>
                        <input
                          type="text"
                          value={folder.date || ''}
                          onChange={e => {
                            const nextFolders = [...store.folders];
                            nextFolders[fIdx] = { ...folder, date: e.target.value };
                            setStore({ ...store, folders: nextFolders });
                          }}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <input
                        type="text"
                        value={folder.description || ''}
                        onChange={e => {
                          const nextFolders = [...store.folders];
                          nextFolders[fIdx] = {
                            ...folder,
                            description: e.target.value
                          };
                          setStore({ ...store, folders: nextFolders });
                        }}
                        placeholder="专题简述..."
                        className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded bg-white text-xs"
                      />

                      <button
                        type="button"
                        onClick={() => {
                          setPhotoTargetType('folder');
                          setSelectedFolderIdx(fIdx);
                          setActiveTab('photos');
                        }}
                        className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg hover:bg-gray-100"
                      >
                        管理照片 ({(store.folderPhotos[folder.title] || []).length} 张)
                      </button>

                      {store.folders.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextFolders = store.folders.filter((_, i) => i !== fIdx);
                            const nextPhotos = { ...store.folderPhotos };
                            delete nextPhotos[folder.title];
                            setStore({
                              ...store,
                              folders: nextFolders,
                              folderPhotos: nextPhotos
                            });
                          }}
                          className="text-xs text-red-600 hover:underline px-2"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Global Tag Cloud Overview */}
            <div className="lg:col-span-5 bg-white border border-gray-200 rounded-xl p-6 h-fit space-y-4">
              <div>
                <h2 className="font-bold text-lg text-gray-900">
                  全站多维标签库 ({allGlobalTags.length} 个标签)
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  点击任意标签可直接在前端标签页预览聚合效果
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {allGlobalTags.map(([tag, count]) => (
                  <Link
                    key={tag}
                    href={`/tags/${encodeURIComponent(tag)}`}
                    target="_blank"
                    className="px-3 py-1.5 text-xs bg-gray-50 hover:bg-red-50 hover:text-red-700 hover:border-red-200 border border-gray-200 rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <span className="font-medium">#{tag}</span>
                    <span className="text-gray-400">({count})</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SITE BRANDING & GIT VERSION CONTROL */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Personal Branding Settings */}
            <div className="lg:col-span-7 bg-white border border-gray-200 rounded-xl p-6 space-y-4 text-sm">
              <h2 className="font-bold text-lg text-gray-900 border-b border-gray-100 pb-3">
                个人品牌与关于页配置
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    摄影师署名 / 首页主标题
                  </label>
                  <input
                    type="text"
                    value={siteConfig.photographerName}
                    onChange={e =>
                      setSiteConfig({ ...siteConfig, photographerName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    浏览器网页标题 (SEO Title)
                  </label>
                  <input
                    type="text"
                    value={siteConfig.siteTitle}
                    onChange={e =>
                      setSiteConfig({ ...siteConfig, siteTitle: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    关于页副标题 (Subtitle)
                  </label>
                  <input
                    type="text"
                    value={siteConfig.subtitle}
                    onChange={e =>
                      setSiteConfig({ ...siteConfig, subtitle: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    页脚版权署名
                  </label>
                  <input
                    type="text"
                    value={siteConfig.copyrightName || ''}
                    onChange={e =>
                      setSiteConfig({ ...siteConfig, copyrightName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  关于页个人简介（第一段）
                </label>
                <textarea
                  rows={3}
                  value={siteConfig.bioParagraph1}
                  onChange={e =>
                    setSiteConfig({ ...siteConfig, bioParagraph1: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  关于页站点说明（第二段）
                </label>
                <textarea
                  rows={2}
                  value={siteConfig.bioParagraph2}
                  onChange={e =>
                    setSiteConfig({ ...siteConfig, bioParagraph2: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              {/* Social Links */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-700">
                    社交媒体链接 (小红书 / 微博 / Instagram 等)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setSiteConfig({
                        ...siteConfig,
                        socials: [
                          ...siteConfig.socials,
                          { label: '新社交平台', url: 'https://' }
                        ]
                      })
                    }
                    className="text-xs text-red-700 hover:underline"
                  >
                    + 添加社交链接
                  </button>
                </div>
                <div className="space-y-2">
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
                        placeholder="平台名称"
                        className="w-36 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs"
                      />
                      <input
                        type="text"
                        value={soc.url}
                        onChange={e => {
                          const next = [...siteConfig.socials];
                          next[sIdx] = { ...soc, url: e.target.value };
                          setSiteConfig({ ...siteConfig, socials: next });
                        }}
                        placeholder="链接 URL"
                        className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = siteConfig.socials.filter((_, i) => i !== sIdx);
                          setSiteConfig({ ...siteConfig, socials: next });
                        }}
                        className="text-xs text-red-600 px-1"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Git Version Snapshot Center */}
            <div className="lg:col-span-5 bg-white border border-gray-200 rounded-xl p-6 h-fit space-y-4">
              <div>
                <h2 className="font-bold text-lg text-gray-900">
                  Git 版本控制与静态发布
                </h2>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  每次修改完相册或上传新照片后，可在此一键保存 Git 版本快照。之后推送到 GitHub 即可自动构建纯静态网站。
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">
                  版本提交说明 (Commit Message)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={e => setCommitMessage(e.target.value)}
                    placeholder="例如：新增香港中环夜景相册照片"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs"
                  />
                  <button
                    type="button"
                    disabled={committing}
                    onClick={handleGitCommit}
                    className="px-4 py-2 bg-gray-900 hover:bg-red-700 text-white text-xs font-medium rounded-lg whitespace-nowrap transition-colors disabled:opacity-50"
                  >
                    {committing ? '正在提交...' : '一键保存 Git 版本'}
                  </button>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <span className="text-xs font-semibold text-gray-600 block mb-2">
                  最近版本记录 (Git Commits)
                </span>
                <ul className="space-y-1.5 text-xs">
                  {gitInfo.commits.map(c => (
                    <li
                      key={c.hash}
                      className="flex items-center justify-between bg-gray-50 px-2.5 py-1.5 rounded border border-gray-100"
                    >
                      <div className="truncate pr-2">
                        <code className="text-red-700 mr-2">{c.hash}</code>
                        <span className="text-gray-700">{c.subject}</span>
                      </div>
                      <span className="text-gray-400 whitespace-nowrap text-[11px]">
                        {c.time}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
