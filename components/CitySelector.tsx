'use client';

import { useState, useMemo } from 'react';
import { Search, MapPin, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// 湖南省 14 个市州坐标（中心点）
export interface City {
  name: string;
  lat: number;
  lng: number;
  gridPoints?: GridPoint[];
  capacity?: number; // 风机装机容量 (MW)
}

// 网格点接口
export interface GridPoint {
  id: number;
  lat: number;
  lng: number;
  value?: number;
}

// 湖南省 14 个市州数据（含风机装机容量）
// 装机容量数据来源：湖南省能源局公开数据（估算值）
export const cities: City[] = [
  { name: '长沙市', lat: 28.2282, lng: 112.9388, capacity: 150 },
  { name: '株洲市', lat: 27.8274, lng: 113.1513, capacity: 200 },
  { name: '湘潭市', lat: 27.8296, lng: 112.9443, capacity: 100 },
  { name: '衡阳市', lat: 26.8968, lng: 112.5714, capacity: 180 },
  { name: '邵阳市', lat: 27.2418, lng: 111.4692, capacity: 220 },
  { name: '岳阳市', lat: 29.3570, lng: 113.0823, capacity: 280 },
  { name: '常德市', lat: 29.0397, lng: 111.6985, capacity: 160 },
  { name: '张家界市', lat: 29.1187, lng: 110.4794, capacity: 80 },
  { name: '益阳市', lat: 28.5544, lng: 112.3553, capacity: 120 },
  { name: '郴州市', lat: 25.7707, lng: 113.0279, capacity: 300 },
  { name: '永州市', lat: 26.4204, lng: 111.6133, capacity: 250 },
  { name: '怀化市', lat: 27.5500, lng: 109.9783, capacity: 190 },
  { name: '娄底市', lat: 27.7279, lng: 111.9966, capacity: 140 },
  { name: '湘西土家族苗族自治州', lat: 28.3116, lng: 109.7397, capacity: 170 },
];

interface CitySelectorProps {
  value: City | null;
  onChange: (city: City) => void;
}

export function CitySelector({ value, onChange }: CitySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showGridPoints, setShowGridPoints] = useState(false);

  // 生成网格点数据（10x10 = 100 个点）
  const generateGridPoints = (city: City): GridPoint[] => {
    const points: GridPoint[] = [];
    const range = 0.5; // 经纬度范围约 50km x 50km
    const step = range / 10; // 10x10 网格

    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        points.push({
          id: i * 10 + j,
          lat: city.lat - range / 2 + i * step,
          lng: city.lng - range / 2 + j * step,
        });
      }
    }
    return points;
  };

  // 模糊搜索过滤
  const filteredCities = useMemo(() => {
    if (!search.trim()) return cities;
    const query = search.toLowerCase();
    return cities.filter(
      (city) =>
        city.name.toLowerCase().includes(query)
    );
  }, [search]);

  const handleSelect = (city: City) => {
    // 生成该城市的 100 个网格点
    const cityWithGrid = { ...city, gridPoints: generateGridPoints(city) };
    onChange(cityWithGrid);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div className="relative w-64">
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        市州选择
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-4 py-2.5',
          'bg-slate-800/50 border border-slate-700 rounded-lg',
          'hover:border-cyan-500/50 hover:bg-slate-800 transition-all',
          'focus:outline-none focus:ring-2 focus:ring-cyan-500/20',
          isOpen && 'border-cyan-500 ring-2 ring-cyan-500/20'
        )}
      >
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-cyan-400" />
          <span className={cn('text-sm', value ? 'text-white' : 'text-slate-500')}>
            {value ? value.name : '选择市州'}
          </span>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-slate-500 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* 下拉列表 */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className={cn(
            'absolute top-full left-0 right-0 mt-2 z-20',
            'bg-slate-800 border border-slate-700 rounded-lg',
            'shadow-xl shadow-black/50 overflow-hidden'
          )}>
            {/* 搜索框 */}
            <div className="p-2 border-b border-slate-700">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/50 rounded-lg">
                <Search className="w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索市州名称..."
                  className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                  autoFocus
                />
              </div>
            </div>

            {/* 市州列表 */}
            <div className="max-h-80 overflow-y-auto">
              {filteredCities.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  未找到匹配的市州
                </div>
              ) : (
                filteredCities.map((city) => (
                  <button
                    key={city.name}
                    type="button"
                    onClick={() => handleSelect(city)}
                    className={cn(
                      'w-full flex items-center justify-between px-4 py-2.5',
                      'hover:bg-cyan-500/10 transition-colors',
                      value?.name === city.name && 'bg-cyan-500/10'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <MapPin className="w-4 h-4 text-slate-500" />
                      <div className="text-left">
                        <div className="text-sm text-white font-medium">{city.name}</div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
