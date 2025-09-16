import React, { useState, useEffect, useMemo } from 'react';
import { useAppData } from '../AppContext';

// Helper do uzyskania numeru tygodnia ISO 8601 i roku tygodnia
const getWeekInfo = (d) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { week: weekNo, year: d.getUTCFullYear() };
};

export default function StatisticsPage() {
    const { stats, fetchStats, API_URL } = useAppData();
    
    // ZMIANA: Zdefiniowany na sztywno zakres lat
    const availableYears = Array.from({ length: 9 }, (_, i) => 2022 + i); // 2022 do 2030
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    
    const [expanded, setExpanded] = useState({});

    useEffect(() => {
        // Upewnij się, że startowy rok jest w dozwolonym zakresie
        if (!availableYears.includes(currentYear)) {
            setCurrentYear(new Date().getFullYear());
        }
    }, []);

    const toggleExpand = (key) => {
        setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const monthlyAggregates = useMemo(() => {
        const aggregates = {};
        stats.forEach(stat => {
            if (stat.dzien) {
                const { rok, miesiac, rodzaj_produktu, ilosc } = stat;
                if (!aggregates[rok]) aggregates[rok] = {};
                if (!aggregates[rok][miesiac]) aggregates[rok][miesiac] = {};
                if (!aggregates[rok][miesiac][rodzaj_produktu]) aggregates[rok][miesiac][rodzaj_produktu] = 0;
                aggregates[rok][miesiac][rodzaj_produktu] += ilosc || 0;
            }
        });
        return aggregates;
    }, [stats]);

    const statsByDate = useMemo(() => {
        const grouped = {};
        stats.forEach(stat => {
            const { rok, miesiac, tydzien, dzien, rodzaj_produktu, ilosc, id } = stat;
            if (!grouped[rok]) grouped[rok] = {};
            if (!grouped[rok][miesiac]) grouped[rok][miesiac] = {};
            
            if (dzien && tydzien) {
                if (!grouped[rok][miesiac][tydzien]) grouped[rok][miesiac][tydzien] = {};
                const dayKey = new Date(dzien).toISOString().split('T')[0];
                if (!grouped[rok][miesiac][tydzien][dayKey]) grouped[rok][miesiac][tydzien][dayKey] = {};
                grouped[rok][miesiac][tydzien][dayKey][rodzaj_produktu] = { ilosc, id };
            } else if (!tydzien && !dzien) {
                 if (!grouped[rok][miesiac]['monthData']) grouped[rok][miesiac]['monthData'] = {};
                 grouped[rok][miesiac]['monthData'][rodzaj_produktu] = { ilosc, id };
            }
        });
        return grouped;
    }, [stats]);
    
    const updateOrCreateStat = async (data) => {
        const { rok, miesiac, tydzien, dzien, ilosc, rodzaj_produktu } = data;
        
        const existingStat = stats.find(s => 
            s.rok === rok && 
            s.miesiac === miesiac && 
            s.tydzien === tydzien && 
            (s.dzien ? new Date(s.dzien).toISOString().split('T')[0] : null) === dzien &&
            s.rodzaj_produktu === rodzaj_produktu
        );
        const id = existingStat ? existingStat.id : null;

        const finalIlosc = ilosc === '' || ilosc === null ? null : parseInt(ilosc, 10);
        const body = { rok, miesiac, tydzien, dzien, ilosc: finalIlosc, rodzaj_produktu };

        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_URL}/statystyki/${id}` : `${API_URL}/statystyki`;
        
        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!response.ok) throw new Error('Błąd zapisu danych.');
            fetchStats();
        } catch (error) {
            console.error("Błąd zapisu statystyk:", error);
        }
    };

    const summary = useMemo(() => {
        const totalSales = stats.reduce((acc, curr) => acc + (curr.ilosc || 0), 0);
        const currentYearSales = stats.filter(s => s.rok === currentYear).reduce((acc, curr) => acc + (curr.ilosc || 0), 0);
        const yearlySales = Object.entries(stats.reduce((acc, curr) => {
            acc[curr.rok] = (acc[curr.rok] || 0) + (curr.ilosc || 0);
            return acc;
        }, {})).map(([year, total]) => ({ year: parseInt(year), total })).filter(y => y.total > 0);

        let trend = "Brak wystarczających danych do predykcji.";
        if (yearlySales.length >= 2) {
            let n = yearlySales.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            yearlySales.forEach(p => {
                sumX += p.year; sumY += p.total; sumXY += p.year * p.total; sumX2 += p.year * p.year;
            });
            const slope = (n * sumX2 - sumX * sumX) !== 0 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 0;
            const intercept = (sumY / n) - slope * (sumX / n);
            const lastYearData = yearlySales.sort((a,b) => a.year - b.year).pop();
            const nextYear = lastYearData.year + 1;
            const prediction = Math.round(Math.max(0, slope * nextYear + intercept));
            let percentageChange = lastYearData.total > 0 ? ((prediction - lastYearData.total) / lastYearData.total) * 100 : 0;
            const trendDirection = percentageChange >= 0 ? "wzrost" : "spadek";
            trend = `Przewidywany ${trendDirection} o ${Math.abs(percentageChange).toFixed(2)}%. Prognoza na ${nextYear}: ~${prediction.toLocaleString('pl-PL')} szt.`;
        }
        return { totalSales, currentYearSales, trend };
    }, [stats, currentYear]);

    const trendInfo = useMemo(() => {
        const prevYearData = statsByDate[currentYear - 1];
        if (!prevYearData) return null;

        const getMonthValue = (year, m, product) => {
            const aggregate = monthlyAggregates[year]?.[m]?.[product];
            if (aggregate !== undefined) return aggregate;
            const monthData = statsByDate[year]?.[m]?.['monthData'];
            return monthData?.[product]?.ilosc ?? null;
        };

        const calculateTrendInfo = (product) => {
            const trends = [];
            const filledMonths = [];
            
            for (let month = 1; month <= 12; month++) {
                const currentYearValue = getMonthValue(currentYear, month, product);
                const prevYearValue = getMonthValue(currentYear - 1, month, product);
                
                if (currentYearValue !== null && currentYearValue > 0 && prevYearValue !== null && prevYearValue > 0) {
                    const trendPercent = ((currentYearValue - prevYearValue) / prevYearValue) * 100;
                    trends.push(trendPercent);
                    filledMonths.push(month);
                }
            }
            
            if (trends.length > 0) {
                const averageTrend = trends.reduce((sum, trend) => sum + trend, 0) / trends.length;
                return {
                    averageTrend: averageTrend,
                    filledMonthsCount: trends.length,
                    filledMonths: filledMonths
                };
            }
            
            return null;
        };

        return {
            PL: calculateTrendInfo('PL'),
            '1 EURO': calculateTrendInfo('1 EURO'),
            '2 EURO': calculateTrendInfo('2 EURO')
        };
    }, [statsByDate, monthlyAggregates, currentYear]);

    const seasonalSuggestions = useMemo(() => {
        const suggestions = {};
        const prevYearData = statsByDate[currentYear - 1];
        if (!prevYearData) return suggestions;

        const getMonthValue = (year, m, product) => {
            const aggregate = monthlyAggregates[year]?.[m]?.[product];
            if (aggregate !== undefined) return aggregate;
            const monthData = statsByDate[year]?.[m]?.['monthData'];
            return monthData?.[product]?.ilosc ?? null;
        };

        // Nowa logika: oblicz średni trend z wszystkich uzupełnionych miesięcy w bieżącym roku
        const calculateAverageTrend = (product) => {
            const trends = [];
            
            for (let month = 1; month <= 12; month++) {
                const currentYearValue = getMonthValue(currentYear, month, product);
                const prevYearValue = getMonthValue(currentYear - 1, month, product);
                
                // Sprawdź czy mamy dane dla obu lat w tym miesiącu
                if (currentYearValue !== null && currentYearValue > 0 && prevYearValue !== null && prevYearValue > 0) {
                    const trendPercent = ((currentYearValue - prevYearValue) / prevYearValue) * 100;
                    trends.push(trendPercent);
                }
            }
            
            // Jeśli mamy co najmniej jeden miesiąc z danymi, oblicz średnią
            if (trends.length > 0) {
                const averageTrend = trends.reduce((sum, trend) => sum + trend, 0) / trends.length;
                return averageTrend / 100; // Konwertuj z procent na współczynnik (np. 50% = 0.5)
            }
            
            return null; // Brak danych do obliczenia trendu
        };

        // Oblicz średnie trendy dla każdego produktu
        const trendPL = calculateAverageTrend('PL');
        const trend1Euro = calculateAverageTrend('1 EURO');
        const trend2Euro = calculateAverageTrend('2 EURO');

        // Generuj sugestie dla wszystkich miesięcy na podstawie średniego trendu
        for (let month = 1; month <= 12; month++) {
            // Sprawdź czy miesiąc nie jest już uzupełniony
            const currentPL = getMonthValue(currentYear, month, 'PL');
            const current1Euro = getMonthValue(currentYear, month, '1 EURO');
            const current2Euro = getMonthValue(currentYear, month, '2 EURO');

            // Sugestie dla PL
            if ((currentPL === null || currentPL === 0) && trendPL !== null) {
                const prevYearPL = getMonthValue(currentYear - 1, month, 'PL');
                if (prevYearPL !== null && prevYearPL > 0) {
                    suggestions[`${month}_PL`] = Math.round(prevYearPL * (1 + trendPL));
                }
            }

            // Sugestie dla 1 EURO
            if ((current1Euro === null || current1Euro === 0) && trend1Euro !== null) {
                const prevYear1Euro = getMonthValue(currentYear - 1, month, '1 EURO');
                if (prevYear1Euro !== null && prevYear1Euro > 0) {
                    suggestions[`${month}_1 EURO`] = Math.round(prevYear1Euro * (1 + trend1Euro));
                }
            }

            // Sugestie dla 2 EURO
            if ((current2Euro === null || current2Euro === 0) && trend2Euro !== null) {
                const prevYear2Euro = getMonthValue(currentYear - 1, month, '2 EURO');
                if (prevYear2Euro !== null && prevYear2Euro > 0) {
                    suggestions[`${month}_2 EURO`] = Math.round(prevYear2Euro * (1 + trend2Euro));
                }
            }
        }

        return suggestions;
    }, [statsByDate, monthlyAggregates, currentYear]);


    const renderDayRows = (year, month, week) => {
        const daysInMonth = new Date(year, month, 0).getDate();
        const rows = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const weekInfo = getWeekInfo(date);
            
            // Renderuj dzień tylko jeśli należy do właściwego tygodnia i roku
            if (weekInfo.week !== week || weekInfo.year !== year) continue;
            
            const dayKey = date.toISOString().split('T')[0];
            const dayData = statsByDate[year]?.[month]?.[week]?.[dayKey] || {};
            const plData = dayData['PL'] || { ilosc: '' };
            const euro1Data = dayData['1 EURO'] || { ilosc: '' };
            const euro2Data = dayData['2 EURO'] || { ilosc: '' };
            
            rows.push(
                <tr key={dayKey} className="day-row">
                    <td>Dzień {day}</td>
                    <td><input type="number" defaultValue={plData.ilosc} onBlur={e => updateOrCreateStat({ rok: year, miesiac: month, tydzien: week, dzien: dayKey, ilosc: e.target.value, rodzaj_produktu: 'PL' })} placeholder="-" /></td>
                    <td><input type="number" defaultValue={euro1Data.ilosc} onBlur={e => updateOrCreateStat({ rok: year, miesiac: month, tydzien: week, dzien: dayKey, ilosc: e.target.value, rodzaj_produktu: '1 EURO' })} placeholder="-" /></td>
                    <td><input type="number" defaultValue={euro2Data.ilosc} onBlur={e => updateOrCreateStat({ rok: year, miesiac: month, tydzien: week, dzien: dayKey, ilosc: e.target.value, rodzaj_produktu: '2 EURO' })} placeholder="-" /></td>
                </tr>
            );
        }
        return rows;
    };

    const renderWeekRows = (year, month) => {
        const weeksInMonth = new Set();
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const weekInfo = getWeekInfo(date);
            // Dodaj tydzień tylko jeśli jego rok jest zgodny z bieżącym rokiem widoku
            if (weekInfo.year === year) {
                weeksInMonth.add(weekInfo.week);
            }
        }
        
        const rows = [];
        Array.from(weeksInMonth).sort((a,b)=>a-b).forEach(week => {
            const weekKey = `${year}-${month}-${week}`;
            rows.push(
                <tr key={weekKey} className="week-row" onClick={() => toggleExpand(weekKey)}>
                    <td><button className="expand-btn">{expanded[weekKey] ? '−' : '+'}</button> Tydzień {week}</td>
                    <td></td><td></td><td></td>
                </tr>
            );
            if (expanded[weekKey]) {
                rows.push(...renderDayRows(year, month, week));
            }
        });
        return rows;
    };
    
    const monthNames = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];

    return (
        <div className="stats-page-container">
            <div className="stats-table-container card">
                <div className="year-navigation">
                    <button onClick={() => setCurrentYear(y => y - 1)} disabled={currentYear <= availableYears[0]} className="btn">‹ {currentYear - 1}</button>
                    <h2>Statystyki za rok: {currentYear}</h2>
                    <button onClick={() => setCurrentYear(y => y + 1)} disabled={currentYear >= availableYears[availableYears.length - 1]} className="btn">{currentYear + 1} ›</button>
                </div>
                <table className="stats-table">
                    <thead><tr>
                        <th>Okres</th>
                        <th>Skarbonki PL</th>
                        <th>Skarbonki 1 EURO</th>
                        <th>Skarbonki 2 EURO</th>
                    </tr></thead>
                    <tbody>
                        {monthNames.map((name, index) => {
                            const month = index + 1;
                            const monthKey = `${currentYear}-${month}`;
                            
                            const hasDailyEntries = !!monthlyAggregates[currentYear]?.[month];
                            const monthData = statsByDate[currentYear]?.[month]?.['monthData'] || {};
                            
                            const plValue = hasDailyEntries ? monthlyAggregates[currentYear][month]['PL'] || 0 : monthData['PL']?.ilosc ?? '';
                            const euro1Value = hasDailyEntries ? monthlyAggregates[currentYear][month]['1 EURO'] || 0 : monthData['1 EURO']?.ilosc ?? '';
                            const euro2Value = hasDailyEntries ? monthlyAggregates[currentYear][month]['2 EURO'] || 0 : monthData['2 EURO']?.ilosc ?? '';

                            return (
                                <React.Fragment key={monthKey}>
                                    <tr className="month-row" onClick={() => toggleExpand(monthKey)}>
                                        <td><button className="expand-btn">{expanded[monthKey] ? '−' : '+'}</button> {name}</td>
                                        <td>
                                            <div className="input-with-suggestion">
                                                <span className="monthly-sum" style={{
                                                    display: 'inline-block',
                                                    padding: '8px 12px',
                                                    backgroundColor: '#f8f9fa',
                                                    border: '1px solid #e9ecef',
                                                    borderRadius: '4px',
                                                    minWidth: '60px',
                                                    textAlign: 'center'
                                                }}>{plValue || 0}</span>
                                                {seasonalSuggestions[`${month}_PL`] && (
                                                    <span className="suggestion-text" title={`Sugestia na podstawie średniego trendu z uzupełnionych miesięcy ${currentYear} roku`}>
                                                        (trend: {seasonalSuggestions[`${month}_PL`]})
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="input-with-suggestion">
                                                <span className="monthly-sum" style={{
                                                    display: 'inline-block',
                                                    padding: '8px 12px',
                                                    backgroundColor: '#f8f9fa',
                                                    border: '1px solid #e9ecef',
                                                    borderRadius: '4px',
                                                    minWidth: '60px',
                                                    textAlign: 'center'
                                                }}>{euro1Value || 0}</span>
                                                {seasonalSuggestions[`${month}_1 EURO`] && (
                                                    <span className="suggestion-text" title={`Sugestia na podstawie średniego trendu z uzupełnionych miesięcy ${currentYear} roku`}>
                                                        (trend: {seasonalSuggestions[`${month}_1 EURO`]})
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="input-with-suggestion">
                                                <span className="monthly-sum" style={{
                                                    display: 'inline-block',
                                                    padding: '8px 12px',
                                                    backgroundColor: '#f8f9fa',
                                                    border: '1px solid #e9ecef',
                                                    borderRadius: '4px',
                                                    minWidth: '60px',
                                                    textAlign: 'center'
                                                }}>{euro2Value || 0}</span>
                                                {seasonalSuggestions[`${month}_2 EURO`] && (
                                                    <span className="suggestion-text" title={`Sugestia na podstawie średniego trendu z uzupełnionych miesięcy ${currentYear} roku`}>
                                                        (trend: {seasonalSuggestions[`${month}_2 EURO`]})
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {expanded[monthKey] && renderWeekRows(currentYear, month)}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="stats-summary-container card">
                <h3>Podsumowanie</h3>
                <div className="summary-item">
                    <h4>Sprzedaż w roku {currentYear}</h4>
                    <p className="summary-value">{summary.currentYearSales.toLocaleString('pl-PL')} szt.</p>
                </div>
                <div className="summary-item">
                    <h4>Całkowita sprzedaż (wszystkie lata)</h4>
                    <p className="summary-value">{summary.totalSales.toLocaleString('pl-PL')} szt.</p>
                </div>
                <div className="summary-item">
                    <h4>Prognoza na następny rok</h4>
                    <p className="summary-value trend-text">{summary.trend}</p>
                </div>
                
                {/* Nowa sekcja z informacjami o trendzie sugestii */}
                {trendInfo && (
                    <div className="summary-item">
                        <h4>Aktualne trendy w {currentYear} roku</h4>
                        <div style={{ fontSize: '0.9em', lineHeight: '1.5' }}>
                            {Object.entries(trendInfo).map(([product, info]) => {
                                if (!info) return null;
                                const trendDirection = info.averageTrend >= 0 ? 'wzrost' : 'spadek';
                                const monthNames = ["", "Sty", "Lut", "Mar", "Kwi", "Maj", "Cze", "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru"];
                                const filledMonthNames = info.filledMonths.map(m => monthNames[m]).join(', ');
                                
                                return (
                                    <p key={product} style={{ margin: '0.5em 0' }}>
                                        <strong>{product}:</strong> {trendDirection} o {Math.abs(info.averageTrend).toFixed(1)}% 
                                        <br />
                                        <span style={{ fontSize: '0.85em', color: '#666' }}>
                                            (na podstawie {info.filledMonthsCount} miesięcy: {filledMonthNames})
                                        </span>
                                    </p>
                                );
                            })}
                            {Object.values(trendInfo).every(info => !info) && (
                                <p style={{ color: '#666', fontStyle: 'italic' }}>
                                    Brak danych do obliczenia trendów. Uzupełnij przynajmniej jeden miesiąc w {currentYear} roku.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Nowa sekcja z planowaną produkcją */}
                <div className="summary-item">
                    <h4>Planowana produkcja do końca {currentYear} roku</h4>
                    <div style={{ fontSize: '0.9em', lineHeight: '1.5' }}>
                        {Object.entries(['PL', '1 EURO', '2 EURO']).map(([index, product]) => {
                            // Oblicz sumę sugestii dla tego produktu
                            const plannedProduction = Object.entries(seasonalSuggestions)
                                .filter(([key]) => key.endsWith(`_${product}`))
                                .reduce((sum, [, value]) => sum + value, 0);

                            return (
                                <p key={product} style={{ margin: '0.5em 0' }}>
                                    <strong>{product}:</strong> {plannedProduction.toLocaleString('pl-PL')} szt.
                                    {plannedProduction === 0 && (
                                        <span style={{ fontSize: '0.85em', color: '#666' }}> (brak sugestii)</span>
                                    )}
                                </p>
                            );
                        })}
                        
                        {/* Suma wszystkich produktów */}
                        {(() => {
                            const totalPlanned = Object.values(seasonalSuggestions).reduce((sum, value) => sum + value, 0);
                            return totalPlanned > 0 ? (
                                <p style={{ margin: '0.8em 0 0 0', paddingTop: '0.5em', borderTop: '1px solid #eee', fontWeight: 'bold' }}>
                                    <strong>Razem:</strong> {totalPlanned.toLocaleString('pl-PL')} szt.
                                </p>
                            ) : (
                                <p style={{ color: '#666', fontStyle: 'italic', margin: '0.5em 0' }}>
                                    Brak aktywnych sugestii produkcji.
                                </p>
                            );
                        })()}
                    </div>
                </div>
            </div>
        </div>
    );
}
