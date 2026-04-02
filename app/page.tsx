'use client';

import { useState, useCallback, useEffect } from 'react';
import { City, CitySelector, cities, GridPoint } from '@/components/CitySelector';
import { DateRangePicker } from '@/components/DateRangePicker';
import { PowerChart, PowerDataPoint, generateMockPowerData, GridPowerData, generateGridPowerData, fetchWindData, generatePowerDataFromWind } from '@/components/PowerChart';
import { Wind, Zap, Activity, TrendingUp, Grid3x3 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// 模拟实时天气数据
function getMockWeather(city: City | null) {
  if (!city) return null;
  const baseTemp = 25 - Math.abs(city.lat - 30) * 0.5;
  const temp = baseTemp + (Math.random() - 0.5) * 5;
  const windSpeed = 3 + Math.random() * 8;
  return {
    temp: temp.toFixed(1),
    weather: ['晴', '多云', '阴', '小雨'][Math.floor(Math.random() * 4)],
    windSpeed: windSpeed.toFixed(1),
    humidity: Math.floor(40 + Math.random() * 40),
  };
}

// 使用与 MCP 服务器相同的 API 获取历史风速数据
async function fetchHistoricalWindData(
  lat: number,
  lng: number,
  startDate: Date,
  endDate: Date
) {
  const startStr = format(startDate, 'yyyy-MM-dd');
  const endStr = format(endDate, 'yyyy-MM-dd');

  // 使用 forecast API 支持过去几天和未来 7 天预报
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&start_date=${startStr}&end_date=${endStr}&hourly=wind_speed_10m,temperature_2m&timezone=Asia%2FShanghai`;

  const response = await fetch(url);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.reason || `API 请求失败：${response.status}`);
  }
  const data = await response.json();

  // 风机参数
  const rotor_radius = 40; // 直径 80m
  const cp = 0.45;
  const efficiency = 0.9;
  const area = Math.PI * Math.pow(rotor_radius, 2);
  const airDensity = 1.225;

  // 找到风速和温度数据
  const windSpeedData = data.hourly?.wind_speed_10m || [];
  const temperatureData = data.hourly?.temperature_2m || [];
  const timeData = data.hourly?.time || [];

  if (windSpeedData.length === 0) {
    throw new Error('该日期范围无风速数据');
  }

  return {
    location: { lat, lng },
    air_density: parseFloat(airDensity.toFixed(4)),
    turbine_params: { rotor_diameter: 80, cp, efficiency },
    hourly_data: timeData.map((t: string, i: number) => {
      // API 返回的是 km/h，转换为 m/s
      const windSpeedMS = (windSpeedData[i] || 0) / 3.6;
      const temperature = temperatureData[i] || 20;
      const power_kw = 0.5 * airDensity * area * Math.pow(windSpeedMS, 3) * cp * efficiency / 1000;
      return {
        time: t,
        wind_speed_10m: parseFloat(windSpeedMS.toFixed(1)),
        temperature_2m: parseFloat(temperature.toFixed(1)),
        power_kw: parseFloat(power_kw.toFixed(2))
      };
    })
  };
}

// 为单个网格点获取风速数据（批量调用，带并发限制）
async function fetchGridWindData(
  gridPoints: Array<{ id: number; lat: number; lng: number }>,
  startDate: Date,
  endDate: Date
) {
  const startStr = format(startDate, 'yyyy-MM-dd');
  const endStr = format(endDate, 'yyyy-MM-dd');

  // 并发限制：每次最多 5 个请求，避免触发 API 速率限制
  const CONCURRENCY_LIMIT = 5;
  const results: any[] = [];

  for (let i = 0; i < gridPoints.length; i += CONCURRENCY_LIMIT) {
    const batch = gridPoints.slice(i, i + CONCURRENCY_LIMIT);
    console.log(`正在获取网格点 ${i + 1}-${Math.min(i + CONCURRENCY_LIMIT, gridPoints.length)} / ${gridPoints.length}`);

    const batchResults = await Promise.allSettled(
      batch.map(async (point) => {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lng}&start_date=${startStr}&end_date=${endStr}&hourly=wind_speed_10m,temperature_2m&timezone=Asia%2FShanghai`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`网格点 ${point.id} API 请求失败`);
        }
        const data = await response.json();

        const windSpeedData = data.hourly?.wind_speed_10m || [];
        const temperatureData = data.hourly?.temperature_2m || [];
        const timeData = data.hourly?.time || [];

        // 风机参数
        const rotor_radius = 40;
        const cp = 0.45;
        const efficiency = 0.9;
        const area = Math.PI * Math.pow(rotor_radius, 2);
        const airDensity = 1.225;

        // 计算每个时刻的功率
        const hourlyPower = timeData.map((t: string, i: number) => {
          const windSpeedMS = (windSpeedData[i] || 0) / 3.6;
          const temperature = temperatureData[i] || 20;
          const power_kw = 0.5 * airDensity * area * Math.pow(windSpeedMS, 3) * cp * efficiency / 1000;
          return {
            time: t,
            wind_speed_10m: parseFloat(windSpeedMS.toFixed(1)),
            temperature_2m: parseFloat(temperature.toFixed(1)),
            power_kw: parseFloat(power_kw.toFixed(2))
          };
        });

        return {
          pointId: point.id,
          lat: point.lat,
          lng: point.lng,
          hourly_data: hourlyPower
        };
      })
    );

    const fulfilled = batchResults
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value);

    results.push(...fulfilled);

    // 每批请求后暂停 100ms，避免触发速率限制
    if (i + CONCURRENCY_LIMIT < gridPoints.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`成功获取 ${results.length}/${gridPoints.length} 个网格点的数据`);

  if (results.length === 0) {
    throw new Error('无法获取任何网格点的数据');
  }

  return results;
}

// 计算全省总功率（按装机容量加权）
async function calculateProvinceTotalPower(
  startDate: Date,
  endDate: Date
): Promise<PowerDataPoint[]> {
  // 计算总装机容量
  const totalCapacity = cities.reduce((sum, city) => sum + (city.capacity || 0), 0);

  // 为每个市州生成 100 个网格点
  const generateGridPoints = (city: any) => {
    const points = [];
    const range = 0.5;
    const step = range / 10;
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

  // 获取所有市州的网格点功率数据
  const cityResults = await Promise.allSettled(
    cities.map(async (city) => {
      const gridPoints = generateGridPoints(city);

      // 获取该市州所有网格点的真实数据
      const gridResults = await fetchGridWindData(gridPoints, startDate, endDate);

      // 计算该时刻每个网格点的功率，然后求平均
      const timePowerMap = new Map<string, number[]>();

      gridResults.forEach((gridResult: any) => {
        gridResult.hourly_data.forEach((h: any) => {
          if (!timePowerMap.has(h.time)) {
            timePowerMap.set(h.time, []);
          }
          timePowerMap.get(h.time)!.push(h.power_kw);
        });
      });

      // 每个时刻：平均功率 × 装机容量
      const data = Array.from(timePowerMap.entries()).map(([time, powers]) => {
        const avgPower = powers.reduce((sum, p) => sum + p, 0) / powers.length;
        return {
          time: time,
          value: avgPower * (city.capacity || 1), // 乘以装机容量加权
        };
      });

      return {
        city: city.name,
        capacity: city.capacity || 0,
        gridPointCount: gridResults.length,
        data,
      };
    })
  );

  // 收集成功的数据
  const allCityData = cityResults
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map(r => r.value);

  if (allCityData.length === 0) {
    throw new Error('无法获取任何市州的数据，请检查日期范围是否正确');
  }

  console.log(`成功获取 ${allCityData.length}/14 个市州的数据，总装机容量：${totalCapacity} MW`);

  // 按时间累加所有市州的加权功率
  const totalMap = new Map<string, number>();
  allCityData.forEach((cityData) => {
    cityData.data.forEach((point: { time: string; value: number }) => {
      const existing = totalMap.get(point.time) || 0;
      totalMap.set(point.time, existing + point.value);
    });
  });

  return Array.from(totalMap.entries())
    .map(([time, value]) => ({ time: time.replace('T', ' '), value }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export default function PowerDashboard() {
  const [selectedCity, setSelectedCity] = useState<City & { gridPoints?: GridPoint[] } | null>(null);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7); // 7 天前
    return date;
  });
  const [endDate, setEndDate] = useState(new Date());
  const [chartData, setChartData] = useState<PowerDataPoint[]>([]);
  const [gridData, setGridData] = useState<GridPowerData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [weather, setWeather] = useState<ReturnType<typeof getMockWeather>>(null);
  const [provinceTotalData, setProvinceTotalData] = useState<PowerDataPoint[]>([]);
  const [showProvinceTotal, setShowProvinceTotal] = useState(false);

  const loadData = useCallback(async () => {
    if (!selectedCity && !showProvinceTotal) return;

    setIsLoading(true);

    try {
      let powerData: PowerDataPoint[] = [];

      if (showProvinceTotal) {
        // 计算全省总功率
        powerData = await calculateProvinceTotalPower(startDate, endDate);
        setGridData([]);
      } else if (selectedCity) {
        // 使用与 MCP 服务器相同的 API 获取历史风速数据
        const windData = await fetchHistoricalWindData(
          selectedCity.lat,
          selectedCity.lng,
          startDate,
          endDate
        );

        // 为每个网格点单独获取真实风速数据
        if (selectedCity.gridPoints && selectedCity.gridPoints.length > 0) {
          // 获取所有网格点的真实数据
          const gridResults = await fetchGridWindData(
            selectedCity.gridPoints,
            startDate,
            endDate
          );

          // 取最新时刻的数据作为网格点功率
          const latestGridData: GridPowerData[] = gridResults.map((result: any) => {
            const latestData = result.hourly_data[result.hourly_data.length - 1] || result.hourly_data[0];
            return {
              id: result.pointId,
              lat: result.lat,
              lng: result.lng,
              value: latestData.power_kw,
              windSpeed: latestData.wind_speed_10m,
              temperature: latestData.temperature_2m
            };
          });
          setGridData(latestGridData);

          // 日志输出
          const avgWindSpeed = gridResults.reduce((sum, r: any) => {
            const latest = r.hourly_data[r.hourly_data.length - 1] || r.hourly_data[0];
            return sum + latest.wind_speed_10m;
          }, 0) / gridResults.length;
          const avgPower = gridResults.reduce((sum, r: any) => {
            const latest = r.hourly_data[r.hourly_data.length - 1] || r.hourly_data[0];
            return sum + latest.power_kw;
          }, 0) / gridResults.length;
          console.log(`网格点平均风速：${avgWindSpeed.toFixed(1)} m/s, 平均功率：${avgPower.toFixed(2)} kW`);
        }

        // 使用真实风速数据生成功率曲线
        powerData = windData.hourly_data.map((d: any) => ({
          time: d.time.replace('T', ' '),
          value: d.power_kw,
        }));
      }

      setChartData(powerData);
      setWeather(selectedCity ? getMockWeather(selectedCity) : null);
    } catch (error) {
      console.error('获取风速数据失败:', error);
      setChartData([]);
      setGridData([]);
      const errorMessage = error instanceof Error ? error.message : '无法获取气象数据';
      alert(`获取数据失败：${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCity, startDate, endDate, showProvinceTotal]);

  useEffect(() => {
    if (selectedCity || showProvinceTotal) {
      loadData();
    }
  }, [selectedCity, showProvinceTotal, loadData]);

  const handleCityChange = (city: City) => {
    setSelectedCity(city);
    setTimeout(() => loadData(), 100);
  };

  const handleDateChange = (start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
  };

  const handleQuery = () => {
    loadData();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-transparent to-transparent" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-transparent" />

      <div className="relative z-10">
        <header className="border-b border-slate-800/50 backdrop-blur-sm bg-slate-900/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white">能源数据监控</h1>
                  <p className="text-xs text-slate-400">Energy Data Dashboard</p>
                </div>
              </div>

              {weather && selectedCity && (
                <div className="hidden md:flex items-center gap-4 px-4 py-2 bg-slate-800/50 rounded-xl border border-slate-700">
                  <div className="flex items-center gap-2">
                    <Wind className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm text-white">{selectedCity.name}</span>
                  </div>
                  <div className="w-px h-4 bg-slate-700" />
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-slate-300">{weather.temp}°C</span>
                    <span className="text-slate-400">{weather.weather}</span>
                    <span className="text-cyan-400">风速 {weather.windSpeed} m/s</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-slate-800/30 border border-slate-700 rounded-2xl p-6 mb-8 backdrop-blur-sm">
            <div className="flex flex-col lg:flex-row lg:items-end gap-6">
              <CitySelector value={selectedCity} onChange={handleCityChange} />

              <button
                type="button"
                onClick={() => {
                  setShowProvinceTotal(!showProvinceTotal);
                  setSelectedCity(null);
                }}
                className={cn(
                  'px-4 py-2.5 rounded-lg font-medium text-sm transition-all',
                  showProvinceTotal
                    ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg shadow-purple-500/25'
                    : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700'
                )}
              >
                全省汇总
              </button>

              <div className="flex-1">
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onChange={handleDateChange}
                  maxDays={30}
                />
              </div>

              <button
                type="button"
                onClick={handleQuery}
                disabled={isLoading || (!selectedCity && !showProvinceTotal)}
                className={cn(
                  'px-6 py-2.5 rounded-lg font-medium text-sm',
                  'transition-all duration-200',
                  isLoading || (!selectedCity && !showProvinceTotal)
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/25 hover:scale-105'
                )}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Activity className="w-4 h-4 animate-spin" />
                    加载中...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    {showProvinceTotal ? '查询全省' : '查询'}
                  </span>
                )}
              </button>
            </div>
          </div>

          {showProvinceTotal ? (
            isLoading ? (
              <div className="bg-slate-800/30 border border-slate-700 rounded-2xl p-12">
                <div className="flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin mb-4" />
                  <p className="text-slate-400">正在计算湖南省 14 个市州的功率数据...</p>
                </div>
              </div>
            ) : chartData.length > 0 ? (
              <PowerChart data={chartData} cityName="湖南省" />
            ) : (
              <div className="bg-slate-800/30 border border-slate-700 rounded-2xl p-12 text-center">
                <Activity className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">暂无数据，请点击查询按钮</p>
              </div>
            )
          ) : selectedCity ? (
            isLoading ? (
              <div className="bg-slate-800/30 border border-slate-700 rounded-2xl p-12">
                <div className="flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-full border-4 border-cyan-500/20 border-t-cyan-500 animate-spin mb-4" />
                  <p className="text-slate-400">正在加载 {selectedCity.name} 的功率数据...</p>
                </div>
              </div>
            ) : chartData.length > 0 ? (
              <PowerChart
                data={chartData}
                gridData={gridData}
                cityName={selectedCity.name}
              />
            ) : (
              <div className="bg-slate-800/30 border border-slate-700 rounded-2xl p-12 text-center">
                <Activity className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">暂无数据，请选择时间范围后点击查询</p>
              </div>
            )
          ) : (
            <div className="bg-slate-800/30 border border-slate-700 rounded-2xl p-12 text-center">
              <Zap className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">请选择城市开始监控</p>
            </div>
          )}

          <div className="mt-8 grid md:grid-cols-3 gap-4">
            <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-4">
              <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                <Grid3x3 className="w-4 h-4" />
                网格分辨率
              </h4>
              <p className="text-xs text-slate-400">
                每个市州 100 个网格点（10×10），功率曲线为 100 点平均值
              </p>
            </div>
            <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-4">
              <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                <Wind className="w-4 h-4" />
                计算参数
              </h4>
              <p className="text-xs text-slate-400">
                基于风功率公式：P = 0.5 × ρ × A × v³ × Cp × η
              </p>
            </div>
            <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-4">
              <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                <Wind className="w-4 h-4" />
                数据来源
              </h4>
              <p className="text-xs text-slate-400">
                风速数据来自 Open-Meteo 历史气象 API，功率基于风功率公式计算
              </p>
            </div>
          </div>
        </main>

        <footer className="border-t border-slate-800/50 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <p className="text-center text-xs text-slate-500">
              湖南省风功率监测系统 · 网格分辨率：10×10 · 数据更新频率：15 分钟 · 最后更新：{format(new Date(), 'yyyy-MM-dd HH:mm:ss')}
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
