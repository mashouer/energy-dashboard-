'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export interface PowerDataPoint {
  time: string;
  value: number;
}

// 网格点数据接口
export interface GridPowerData {
  id: number;
  lat: number;
  lng: number;
  value: number;
  windSpeed?: number;
  temperature?: number;
}

/**
 * 从 Open-Meteo API 获取风速数据
 */
export async function fetchWindData(
  lat: number,
  lng: number,
  startDate: Date,
  endDate: Date
): Promise<{ time: string; windSpeed: number }[]> {
  const startStr = format(startDate, 'yyyy-MM-dd');
  const endStr = format(endDate, 'yyyy-MM-dd');

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${startStr}&end_date=${endStr}&hourly=wind_speed_10m&timezone=Asia%2FShanghai`;

  const response = await fetch(url);
  const data = await response.json();

  if (!data.hourly || !data.hourly.time) {
    throw new Error('无法获取风速数据');
  }

  return data.hourly.time.map((time: string, index: number) => ({
    time,
    windSpeed: data.hourly.wind_speed_10m[index] || 0,
  }));
}

/**
 * 生成模拟功率数据（基于真实风速或模拟风速）
 */
export function generatePowerDataFromWind(
  windData: { time: string; windSpeed: number }[],
  basePower = 500
): PowerDataPoint[] {
  return windData.map((item) => {
    const windSpeed = item.windSpeed;

    // 空气密度
    const airDensity = 1.225;

    // 风机叶片扫掠面积（假设直径 80m）
    const area = Math.PI * Math.pow(40, 2);

    // 风能利用系数
    const cp = 0.45;

    // 机械效率
    const efficiency = 0.9;

    // 风功率计算：P = 0.5 × ρ × A × v³ × Cp × η
    const power = 0.5 * airDensity * area * Math.pow(windSpeed, 3) * cp * efficiency / 1000;

    // 限制功率范围（风机有额定功率）
    const cappedPower = Math.min(Math.max(power, 0), 2000); // 最大 2000kW

    return {
      time: item.time.replace('T', ' '),
      value: parseFloat(cappedPower.toFixed(1)),
    };
  });
}

/**
 * 生成模拟功率数据（备用方案，当 API 不可用时）
 * 基于正弦波模拟日夜功率变化，并叠加每日随机变化
 */
export function generateMockPowerData(
  startTime: Date,
  endTime: Date,
  basePower = 500
): PowerDataPoint[] {
  const data: PowerDataPoint[] = [];
  const current = new Date(startTime);

  // 为每天生成一个随机变化因子
  const dailyRandomFactors: { [key: string]: number } = {};
  const tempDate = new Date(startTime);
  while (tempDate <= endTime) {
    const dateKey = format(tempDate, 'yyyy-MM-dd');
    dailyRandomFactors[dateKey] = 0.7 + Math.random() * 0.6;
    tempDate.setDate(tempDate.getDate() + 1);
  }

  while (current <= endTime) {
    const dateKey = format(current, 'yyyy-MM-dd');
    const hours = current.getHours() + current.getMinutes() / 60;
    const dayOfYear = Math.floor(
      (current.getTime() - new Date(current.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
    );

    const dailyFactor = dailyRandomFactors[dateKey] || 1.0;
    const dailyCycle = Math.sin((hours - 6) * (Math.PI / 12));
    const seasonalCycle = Math.sin((dayOfYear - 80) * (2 * Math.PI / 365)) * 0.3;
    const hourlyNoise = (Math.sin(current.getHours() * 0.5 + current.getMinutes() * 0.01) + Math.random() - 0.5) * 0.15;

    const power = basePower * dailyFactor * (1 + dailyCycle * 0.4 + seasonalCycle + hourlyNoise);
    const value = Math.max(100, power);

    data.push({
      time: format(current, 'yyyy-MM-dd HH:mm'),
      value: parseFloat(value.toFixed(1)),
    });

    current.setMinutes(current.getMinutes() + 15);
  }

  return data;
}

/**
 * 生成网格点风功率数据（100 个点）
 * 基于真实风速数据，使用空间插值为每个网格点计算功率
 *
 * @param gridPoints 网格点坐标数组
 * @param centerLat 市中心纬度
 * @param centerLng 市中心经度
 * @param baseWindSpeed 市中心真实风速 (m/s)
 * @param baseTemperature 市中心温度 (°C)
 */
export function generateGridPowerData(
  gridPoints: Array<{ id: number; lat: number; lng: number }>,
  centerLat: number,
  centerLng: number,
  baseWindSpeed: number,
  baseTemperature: number = 20
): GridPowerData[] {
  return gridPoints.map((point) => {
    // 计算网格点与市中心的距离（公里）
    const latDiff = point.lat - centerLat;
    const lngDiff = point.lng - centerLng;
    // 1 度纬度约 111km，1 度经度约 111km × cos(纬度)
    const distanceKm = Math.sqrt(
      Math.pow(latDiff * 111, 2) +
      Math.pow(lngDiff * 111 * Math.cos(centerLat * Math.PI / 180), 2)
    );

    // 空间插值：距离市中心越远，风速变化越大
    // 添加基于距离和位置的风速变化（模拟地形影响）
    const distanceFactor = 1 + (Math.random() - 0.5) * 0.1; // ±5% 随机变化
    const latGradient = 1 + latDiff * 0.02; // 纬度每 0.1 度约±1% 变化
    const lngGradient = 1 + lngDiff * 0.02; // 经度每 0.1 度约±1% 变化

    // 插值风速 = 中心风速 × 距离因子 × 纬度梯度 × 经度梯度
    const windSpeed = baseWindSpeed * distanceFactor * latGradient * lngGradient;

    // 温度插值（随距离和随机变化）
    const tempVariation = (Math.random() - 0.5) * 2; // ±1°C 随机变化
    const temperature = baseTemperature + distanceKm * 0.02 + tempVariation;

    // 空气密度（基于温度修正）
    const airDensity = 1.225 * (293.15 / (temperature + 273.15));

    // 风机叶片扫掠面积（假设直径 80m）
    const area = Math.PI * Math.pow(40, 2);

    // 风能利用系数（Betz 极限 0.593，实际约 0.4-0.5）
    const cp = 0.45;

    // 机械效率
    const efficiency = 0.9;

    // 风功率计算：P = 0.5 × ρ × A × v³ × Cp × η
    const power = 0.5 * airDensity * area * Math.pow(windSpeed, 3) * cp * efficiency / 1000; // kW

    return {
      id: point.id,
      lat: point.lat,
      lng: point.lng,
      value: parseFloat(power.toFixed(2)),
      windSpeed: parseFloat(windSpeed.toFixed(1)),
      temperature: parseFloat(temperature.toFixed(1)),
    };
  });
}

interface PowerChartProps {
  data: PowerDataPoint[];
  gridData?: GridPowerData[];
  cityName: string;
  className?: string;
  showGrid?: boolean;
}

export function PowerChart({ data, gridData, cityName, className, showGrid = false }: PowerChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartInstance, setChartInstance] = useState<echarts.ECharts | null>(null);

  // 初始化图表
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current, 'dark', {
      renderer: 'canvas',
      devicePixelRatio: window.devicePixelRatio,
    });

    setChartInstance(chart);

    // 响应式缩放
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, []);

  // 更新图表数据 - 功率曲线模式
  useEffect(() => {
    if (!chartInstance || data.length === 0) return;

    const times = data.map((d) => format(new Date(d.time), 'MM-dd HH:mm'));
    const values = data.map((d) => d.value);
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: 'rgba(0, 245, 255, 0.3)',
        borderWidth: 1,
        textStyle: {
          color: '#e2f0ff',
          fontSize: 12,
        },
        padding: [12, 16],
        formatter: (params: any) => {
          const point = params[0];
          const value = point.value as number;
          return `
            <div style="font-weight: 600; margin-bottom: 8px;">${point.name}</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: #00f5ff; display: inline-block;"></span>
              功率：<span style="color: #00f5ff; font-weight: 600;">${value.toFixed(1)} kW</span>
            </div>
          `;
        },
      },
      axisPointer: {
        type: 'cross',
        lineStyle: {
          color: '#00f5ff',
          width: 1,
          type: 'dashed',
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '80',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: times,
        axisLine: {
          lineStyle: {
            color: 'rgba(226, 240, 255, 0.2)',
          },
        },
        axisLabel: {
          color: 'rgba(226, 240, 255, 0.6)',
          fontSize: 11,
          margin: 16,
          rotate: 0,
        },
        axisTick: {
          show: false,
        },
      },
      yAxis: {
        type: 'value',
        name: '功率 (kW)',
        nameTextStyle: {
          color: 'rgba(226, 240, 255, 0.6)',
          fontSize: 12,
          padding: [0, 0, 0, 8],
        },
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(0, 245, 255, 0.1)',
            type: 'dashed',
          },
        },
        axisLabel: {
          color: 'rgba(226, 240, 255, 0.6)',
          fontSize: 11,
          formatter: (value: number) => {
            if (value >= 1000) {
              return `${(value / 1000).toFixed(0)}M`;
            }
            return value.toString();
          },
        },
      },
      dataZoom: [
        {
          type: 'slider',
          show: true,
          xAxisIndex: [0],
          start: 0,
          end: Math.min(100, Math.max(20, (24 * 4) / data.length * 100)),
          bottom: 10,
          height: 24,
          borderColor: 'transparent',
          backgroundColor: 'rgba(30, 41, 59, 0.5)',
          fillerColor: 'rgba(0, 245, 255, 0.2)',
          handleStyle: {
            color: '#00f5ff',
            shadowColor: 'rgba(0, 245, 255, 0.5)',
            shadowBlur: 10,
          },
          textStyle: {
            color: 'transparent',
          },
        },
        {
          type: 'inside',
          xAxisIndex: [0],
          start: 0,
          end: 100,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
        },
      ],
      series: [
        {
          name: '功率',
          type: 'line',
          smooth: true,
          symbol: 'none',
          sampling: 'average',
          lineStyle: {
            color: '#00f5ff',
            width: 2,
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              {
                offset: 0,
                color: 'rgba(0, 245, 255, 0.5)',
              },
              {
                offset: 1,
                color: 'rgba(0, 245, 255, 0)',
              },
            ]),
          },
          data: values,
        },
      ],
    };

    chartInstance.setOption(option, true);
  }, [chartInstance, data]);

  // 网格数据统计
  const gridStats = gridData && gridData.length > 0
    ? {
        max: Math.max(...gridData.map((d) => d.value)),
        min: Math.min(...gridData.map((d) => d.value)),
        avg: gridData.reduce((a, b) => a + b.value, 0) / gridData.length,
        total: gridData.reduce((a, b) => a + b.value, 0),
      }
    : null;

  // 曲线数据统计
  const curveStats = data.length > 0
    ? {
        max: Math.max(...data.map((d) => d.value)),
        min: Math.min(...data.map((d) => d.value)),
        avg: data.reduce((a, b) => a + b.value, 0) / data.length,
        total: data.reduce((a, b) => a + b.value, 0) * 0.25,
      }
    : null;

  const stats = gridStats || curveStats;

  return (
    <div className={cn('w-full', className)}>
      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <div className="text-xs text-slate-400 mb-1">{gridData ? '单点最大功率' : '最大功率'}</div>
            <div className="text-2xl font-bold text-cyan-400">{stats.max.toFixed(gridData ? 2 : 0)}</div>
            <div className="text-xs text-slate-500">kW</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <div className="text-xs text-slate-400 mb-1">{gridData ? '单点最小功率' : '最小功率'}</div>
            <div className="text-2xl font-bold text-purple-400">{stats.min.toFixed(gridData ? 2 : 0)}</div>
            <div className="text-xs text-slate-500">kW</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <div className="text-xs text-slate-400 mb-1">平均功率</div>
            <div className="text-2xl font-bold text-blue-400">{stats.avg.toFixed(gridData ? 2 : 0)}</div>
            <div className="text-xs text-slate-500">kW</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <div className="text-xs text-slate-400 mb-1">总功率</div>
            <div className="text-2xl font-bold text-green-400">{(stats.total / 1000).toFixed(1)}</div>
            <div className="text-xs text-slate-500">MW</div>
          </div>
        </div>
      )}

      {/* 图表容器 */}
      <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-white">
              {gridData ? '网格点功率分布' : '功率趋势分析'}
            </h3>
            {gridData && (
              <span className="text-xs text-cyan-400 bg-cyan-500/20 px-2 py-1 rounded">
                100 个网格点
              </span>
            )}
          </div>
          <span className="text-sm text-slate-400">{cityName}</span>
        </div>
        <div
          ref={chartRef}
          className="w-full h-[500px] md:h-[600px]"
          style={{ minHeight: '500px' }}
        />
        {gridData && (
          <p className="text-xs text-slate-500 mt-2 text-center">
            每个点代表一个 10km x 10km 网格中心的风功率输出
          </p>
        )}
      </div>
    </div>
  );
}
