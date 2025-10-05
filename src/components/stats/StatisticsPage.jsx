import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

const monthNames = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"]; // <--- Zbyt późno!

    
    // ZMIANA 1: Nowy stan do przechowywania wybranych miesięcy (od 1 do 12)
    const initialSelectedMonths = Array.from({ length: 12 }, (_, i) => i + 1);
    const [selectedMonths, setSelectedMonths] = useState(initialSelectedMonths); // Domyślnie wszystkie 12
    
    const availableYears = Array.from({ length: 9 }, (_, i) => 2022 + i); // 2022 do 2030
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    
    const [expanded, setExpanded] = useState({});

    useEffect(() => {
        if (!availableYears.includes(currentYear)) {
            setCurrentYear(new Date().getFullYear());
        }
    }, []);

    const toggleExpand = (key) => {
        setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Nowa funkcja do zarządzania wyborem miesięcy
const toggleMonthSelection = useCallback((month) => {
    setSelectedMonths(prev => {
        if (prev.includes(month)) {
            const newSelection = prev.filter(m => m !== month);
            // TUTAJ JEST PROBLEM
            return newSelection.length > 0 ? newSelection : [month]; // Zawsze co najmniej jeden miesiąc
        } else {
            return [...prev, month].sort((a, b) => a - b);
        }
    });
}, []);

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
        
        // ZMIANA 2: Filtrowanie danych rocznych tylko dla wybranych miesięcy
        const yearlySales = Object.entries(stats
            .filter(s => selectedMonths.includes(s.miesiac))
            .reduce((acc, curr) => {
                acc[curr.rok] = (acc[curr.rok] || 0) + (curr.ilosc || 0);
                return acc;
            }, {})
        )
        .map(([year, total]) => ({ year: parseInt(year), total }))
        .filter(y => y.total > 0);

        let trend = "Brak wystarczających danych do predykcji.";
        if (yearlySales.length >= 2) {
            // Regresja liniowa jest ok, ale w tym przypadku liczymy trend dla podzbioru miesięcy
            // Zmodyfikujmy opis trendu, by to odzwierciedlał.
            let n = yearlySales.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            yearlySales.forEach(p => {
                sumX += p.year; sumY += p.total; sumXY += p.year * p.total; sumX2 += p.year * p.year;
            });
            const denominator = (n * sumX2 - sumX * sumX);
            const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
            const intercept = (sumY / n) - slope * (sumX / n);
            const lastYearData = yearlySales.sort((a,b) => a.year - b.year).pop();
            const nextYear = lastYearData.year + 1;
                
            // Prognoza na następny rok jest skalowana w oparciu o sumę TYLKO wybranych miesięcy.
            const prediction = Math.round(Math.max(0, slope * nextYear + intercept));
            
            let percentageChange = lastYearData.total > 0 ? ((prediction - lastYearData.total) / lastYearData.total) * 100 : 0;
            const trendDirection = percentageChange >= 0 ? "wzrost" : "spadek";
            
// Wewnątrz useMemo 'summary'
const monthRange = selectedMonths.length === 12 ? 'Cały rok' : selectedMonths.map(m => monthNames[m-1].substring(0, 3)).join(', ');            
            trend = `Przewidywany ${trendDirection} o ${Math.abs(percentageChange).toFixed(2)}% (na podstawie: ${monthRange}). Prognoza na ${nextYear}: ~${prediction.toLocaleString('pl-PL')} szt.`;
        }
        return { totalSales, currentYearSales, trend };
    }, [stats, currentYear, selectedMonths]);

        const getMonthValue = useCallback((year, m, product) => {
            const aggregate = monthlyAggregates[year]?.[m]?.[product];
            if (aggregate !== undefined) return aggregate;
            const monthData = statsByDate[year]?.[m]?.['monthData'];
            return monthData?.[product]?.ilosc ?? null;
        }, [monthlyAggregates, statsByDate]);
    
    // ZMIANA 3: Przekazanie selectedMonths do trendInfo
    const trendInfo = useMemo(() => {
        const prevYearData = statsByDate[currentYear - 1];
        if (!prevYearData) return null;

        const calculateTrendInfo = (product) => {
            const trends = [];
            const filledMonths = [];
            
            for (let month of selectedMonths) { // Używamy tylko wybranych miesięcy
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
    }, [statsByDate, monthlyAggregates, currentYear, selectedMonths, getMonthValue]);

    // ZMIANA 4: Przekazanie selectedMonths do seasonalSuggestions
    const seasonalSuggestions = useMemo(() => {
        const suggestions = {};
        const prevYearData = statsByDate[currentYear - 1];
        if (!prevYearData) return suggestions;

        const getMonthValueLocal = (year, m, product) => {
            const aggregate = monthlyAggregates[year]?.[m]?.[product];
            if (aggregate !== undefined) return aggregate;
            const monthData = statsByDate[year]?.[m]?.['monthData'];
            return monthData?.[product]?.ilosc ?? null;
        };

        // Nowa logika: oblicz średni trend z *wybranych* miesięcy w bieżącym roku
        const calculateAverageTrend = (product) => {
            const trends = [];
            
            for (let month of selectedMonths) { // Używamy tylko wybranych miesięcy
                const currentYearValue = getMonthValueLocal(currentYear, month, product);
                const prevYearValue = getMonthValueLocal(currentYear - 1, month, product);
                
                // Sprawdź czy mamy dane dla obu lat w tym miesiącu
                if (currentYearValue !== null && currentYearValue > 0 && prevYearValue !== null && prevYearValue > 0) {
                    const trendPercent = ((currentYearValue - prevYearValue) / prevYearValue) * 100;
                    trends.push(trendPercent);
                }
            }
            
            if (trends.length > 0) {
                const averageTrend = trends.reduce((sum, trend) => sum + trend, 0) / trends.length;
                return averageTrend / 100; // Konwertuj z procent na współczynnik (np. 50% = 0.5)
            }
            
            return null;
        };

        const trendPL = calculateAverageTrend('PL');
        const trend1Euro = calculateAverageTrend('1 EURO');
        const trend2Euro = calculateAverageTrend('2 EURO');

        // Generuj sugestie dla wszystkich miesięcy, które NIE SĄ uzupełnione.
        // Sugestie są obliczane na podstawie średniego trendu Z WYBRANYCH miesięcy.
        for (let month = 1; month <= 12; month++) {
            const currentPL = getMonthValueLocal(currentYear, month, 'PL');
            const current1Euro = getMonthValueLocal(currentYear, month, '1 EURO');
            const current2Euro = getMonthValueLocal(currentYear, month, '2 EURO');

            // Sugestie dla PL
            if ((currentPL === null || currentPL === 0) && trendPL !== null) {
                const prevYearPL = getMonthValueLocal(currentYear - 1, month, 'PL');
                if (prevYearPL !== null && prevYearPL > 0) {
                    suggestions[`${month}_PL`] = Math.round(prevYearPL * (1 + trendPL));
                }
            }

            // Sugestie dla 1 EURO
            if ((current1Euro === null || current1Euro === 0) && trend1Euro !== null) {
                const prevYear1Euro = getMonthValueLocal(currentYear - 1, month, '1 EURO');
                if (prevYear1Euro !== null && prevYear1Euro > 0) {
                    suggestions[`${month}_1 EURO`] = Math.round(prevYear1Euro * (1 + trend1Euro));
                }
            }

            // Sugestie dla 2 EURO
            if ((current2Euro === null || current2Euro === 0) && trend2Euro !== null) {
                const prevYear2Euro = getMonthValueLocal(currentYear - 1, month, '2 EURO');
                if (prevYear2Euro !== null && prevYear2Euro > 0) {
                    suggestions[`${month}_2 EURO`] = Math.round(prevYear2Euro * (1 + trend2Euro));
                }
            }
        }

        return suggestions;
    }, [statsByDate, monthlyAggregates, currentYear, selectedMonths]); // Dodajemy selectedMonths do zależności


    const renderDayRows = (year, month, week) => {
        const daysInMonth = new Date(year, month, 0).getDate();
        const rows = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const weekInfo = getWeekInfo(date);
            
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
    
// ... koniec logiki useMemo
// ZMIANA 4: Przekazanie selectedMonths do seasonalSuggestions
// ...
// ...
    // ZMIANA 5: Funkcja pomocnicza do renderowania interfejsu wyboru miesięcy
    const renderMonthSelector = () => {
        const shortMonthNames = ["Sty", "Lut", "Mar", "Kwi", "Maj", "Cze", "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru"];
        return (
            <div style={{ marginBottom: '15px', padding: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
                <h4>Miesiące do obliczenia trendu rocznego</h4>
                <p style={{ fontSize: '0.8em', color: '#666', margin: '5px 0' }}>
                    Zaznacz miesiące, których dane mają być użyte do obliczenia rocznej prognozy trendu (na podstawie porównania z poprzednim rokiem).
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {shortMonthNames.map((name, index) => {
                        const month = index + 1;
                        const isSelected = selectedMonths.includes(month);
                        return (
                            <button
                                key={month}
                                onClick={() => toggleMonthSelection(month)}
                                style={{
                                    padding: '5px 10px',
                                    backgroundColor: isSelected ? '#007bff' : '#f0f0f0',
                                    color: isSelected ? 'white' : 'black',
                                    border: isSelected ? '1px solid #007bff' : '1px solid #ccc',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontWeight: isSelected ? 'bold' : 'normal',
                                    transition: 'background-color 0.2s',
                                    flexGrow: 1,
                                    maxWidth: 'calc(100% / 6 - 8px)' // 6 przycisków w wierszu
                                }}
                            >
                                {name}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

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
                                                {seasonalSuggestions[`${month}_PL`] && (plValue === '' || plValue === 0) && (
                                                    <span className="suggestion-text" title={`Sugestia na podstawie średniego trendu z uzupełnionych ${selectedMonths.length === 12 ? 'wszystkich' : selectedMonths.length} wybranych miesięcy ${currentYear} roku`}>
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
                                                {seasonalSuggestions[`${month}_1 EURO`] && (euro1Value === '' || euro1Value === 0) && (
                                                    <span className="suggestion-text" title={`Sugestia na podstawie średniego trendu z uzupełnionych ${selectedMonths.length === 12 ? 'wszystkich' : selectedMonths.length} wybranych miesięcy ${currentYear} roku`}>
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
                                                {seasonalSuggestions[`${month}_2 EURO`] && (euro2Value === '' || euro2Value === 0) && (
                                                    <span className="suggestion-text" title={`Sugestia na podstawie średniego trendu z uzupełnionych ${selectedMonths.length === 12 ? 'wszystkich' : selectedMonths.length} wybranych miesięcy ${currentYear} roku`}>
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
                
                {/* ZMIANA 6: Dodanie selektora miesięcy */}
                {renderMonthSelector()}
                
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
                        <p style={{ fontSize: '0.85em', color: '#888', margin: '0 0 10px 0' }}>
                            Trend obliczony tylko dla **wybranych** miesięcy.
                        </p>
                        <div style={{ fontSize: '0.9em', lineHeight: '1.5' }}>
                            {Object.entries(trendInfo).map(([product, info]) => {
                                if (!info) return null;
                                const trendDirection = info.averageTrend >= 0 ? 'wzrost' : 'spadek';
                                const monthNamesShort = ["", "Sty", "Lut", "Mar", "Kwi", "Maj", "Cze", "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru"];
                                const filledMonthNames = info.filledMonths.map(m => monthNamesShort[m]).join(', ');
                                
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
                                    Brak danych do obliczenia trendów dla wybranych miesięcy.
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
                            // Oblicz sumę sugestii dla tego produktu (tylko dla miesięcy, które nie są uzupełnione)
                            const plannedProduction = Object.entries(seasonalSuggestions)
                                .filter(([key]) => {
                                    const [monthStr, prod] = key.split('_');
                                    const month = parseInt(monthStr, 10);
                                    // Sugestie są generowane tylko dla niezapelnionych miesięcy,
                                    // a my zliczamy te dla naszego produktu
                                    return prod === product;
                                })
                                .reduce((sum, [, value]) => sum + value, 0);

                            return (
                                <p key={product} style={{ margin: '0.5em 0' }}>
                                    <strong>{product}:</strong> {plannedProduction.toLocaleString('pl-PL')} szt.
                                    {plannedProduction === 0 && (
                                        <span style={{ fontSize: '0.85em', color: '#666' }}> (brak sugestii lub brak trendu z wybranych miesięcy)</span>
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
