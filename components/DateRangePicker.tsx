'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface DateRangePickerProps {
  startDate: Date;
  endDate: Date;
  onChange: (start: Date, end: Date) => void;
  maxDays?: number;
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  maxDays = 30,
}: DateRangePickerProps) {
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isEndOpen, setIsEndOpen] = useState(false);
  const [tempStart, setTempStart] = useState(format(startDate, "yyyy-MM-dd'T'HH:mm"));
  const [tempEnd, setTempEnd] = useState(format(endDate, "yyyy-MM-dd'T'HH:mm"));

  // 同步外部日期变化
  useEffect(() => {
    setTempStart(format(startDate, "yyyy-MM-dd'T'HH:mm"));
    setTempEnd(format(endDate, "yyyy-MM-dd'T'HH:mm"));
  }, [startDate, endDate]);

  const handleStartChange = (value: string) => {
    setTempStart(value);
    const newStart = new Date(value);
    if (!isNaN(newStart.getTime())) {
      // 确保开始时间不超过结束时间
      if (newStart <= endDate) {
        onChange(newStart, endDate);
      }
    }
  };

  const handleEndChange = (value: string) => {
    setTempEnd(value);
    const newEnd = new Date(value);
    if (!isNaN(newEnd.getTime())) {
      // 确保结束时间不早于开始时间
      if (newEnd >= startDate) {
        // 检查时间跨度
        const diffDays = (newEnd.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays <= maxDays) {
          onChange(startDate, newEnd);
        }
      }
    }
  };

  // 快捷选项
  const quickRanges = [
    { label: '最近 7 天', days: 7 },
    { label: '最近 15 天', days: 15 },
    { label: '最近 30 天', days: 30 },
  ];

  const handleQuickSelect = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    onChange(start, end);
  };

  // 计算时间跨度
  const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const isOverLimit = diffDays > maxDays;

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-400">
        时间范围
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {/* 开始时间 */}
        <div className="relative">
          <div className={cn(
            'flex items-center gap-2 px-3 py-2',
            'bg-slate-800/50 border rounded-lg',
            isStartOpen ? 'border-cyan-500 ring-2 ring-cyan-500/20' : 'border-slate-700'
          )}>
            <Calendar className="w-4 h-4 text-slate-500" />
            <input
              type="datetime-local"
              value={tempStart}
              onChange={(e) => handleStartChange(e.target.value)}
              onFocus={() => setIsStartOpen(true)}
              onBlur={() => setIsStartOpen(false)}
              className="bg-transparent text-sm text-white focus:outline-none"
            />
          </div>
        </div>

        <span className="text-slate-500">-</span>

        {/* 结束时间 */}
        <div className="relative">
          <div className={cn(
            'flex items-center gap-2 px-3 py-2',
            'bg-slate-800/50 border rounded-lg',
            isEndOpen ? 'border-cyan-500 ring-2 ring-cyan-500/20' : 'border-slate-700'
          )}>
            <Clock className="w-4 h-4 text-slate-500" />
            <input
              type="datetime-local"
              value={tempEnd}
              onChange={(e) => handleEndChange(e.target.value)}
              onFocus={() => setIsEndOpen(true)}
              onBlur={() => setIsEndOpen(false)}
              className="bg-transparent text-sm text-white focus:outline-none"
            />
          </div>
        </div>

        {/* 快捷选项 */}
        <div className="hidden md:flex items-center gap-1 ml-2">
          {quickRanges.map((range) => (
            <button
              key={range.days}
              type="button"
              onClick={() => handleQuickSelect(range.days)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md transition-colors',
                diffDays === range.days
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700'
              )}
            >
              {range.label}
            </button>
          ))}
        </div>

        {/* 时间跨度提示 */}
        <div className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs',
          isOverLimit
            ? 'bg-red-500/20 text-red-400'
            : 'bg-slate-800/50 text-slate-400'
        )}>
          <Clock className="w-3 h-3" />
          <span>{diffDays} 天</span>
        </div>
      </div>

      {isOverLimit && (
        <p className="text-xs text-red-400 mt-1">
          时间跨度超过 {maxDays} 天，可能影响渲染性能
        </p>
      )}
    </div>
  );
}
