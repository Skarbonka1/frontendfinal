import React, { useState, useEffect } from 'react';
import { useAppData } from '../AppContext';

export default function TodayTasksView() {
    const { user: currentUser, calendarTasks, fetchCalendarTasks } = useAppData();
    const [tasks, setTasks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // ZMIANA: Dodajemy stan do zarządzania modalem (tak jak we "Wszystkich zadaniach")
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTaskContent, setSelectedTaskContent] = useState('');

    const API_BASE_URL = 'https://serwerfinal.onrender.com';

    // Nowa logika filtrowania zadań przypisanych do użytkownika
    useEffect(() => {
        if (!currentUser || !calendarTasks) {
            setTasks([]);
            setIsLoading(false);
            return;
        }

        try {
            // Filtrujemy zadania przypisane do użytkownika (bez ograniczenia dat)
            let userTasks = calendarTasks.filter(task => {
                // Sprawdź czy zadanie jest przypisane do użytkownika
                const isAssigned = task.assignedUsers && task.assignedUsers.includes(currentUser.username);
                
                // Sprawdź czy zadanie nie jest zakończone
                const isNotCompleted = task.status !== 'zakończone';
                
                return isAssigned && isNotCompleted;
            });

            // Dla zadań cyklicznych pokazuj tylko pierwsze niewykonane z każdej serii
            const recurringGroups = {};
            const filteredTasks = [];

            userTasks.forEach(task => {
                if (task.recurring_task_id) {
                    // To jest zadanie cykliczne - grupuj według recurring_task_id
                    if (!recurringGroups[task.recurring_task_id]) {
                        recurringGroups[task.recurring_task_id] = [];
                    }
                    recurringGroups[task.recurring_task_id].push(task);
                } else {
                    // To jest zwykłe zadanie - dodaj bezpośrednio
                    filteredTasks.push(task);
                }
            });

            // Dla każdej grupy zadań cyklicznych, znajdź pierwsze niewykonane
            Object.values(recurringGroups).forEach(taskGroup => {
                // Sortuj zadania według numeru w tytule (#1, #2, #3...)
                const sortedTasks = taskGroup.sort((a, b) => {
                    const matchA = a.title.match(/#(\d+)$/);
                    const matchB = b.title.match(/#(\d+)$/);
                    
                    if (matchA && matchB) {
                        return parseInt(matchA[1]) - parseInt(matchB[1]);
                    }
                    
                    // Fallback - sortuj według deadline
                    const dateA = a.deadline ? new Date(a.deadline) : new Date(a.publication_date);
                    const dateB = b.deadline ? new Date(b.deadline) : new Date(b.publication_date);
                    return dateA - dateB;
                });

                // Znajdź pierwsze zadanie które nie jest zakończone
                const firstIncomplete = sortedTasks.find(task => task.status !== 'zakończone');
                
                if (firstIncomplete) {
                    filteredTasks.push(firstIncomplete);
                }
            });

            // Sortuj zadania według priorytetu (deadline) - najwcześniejsze pierwsze
            filteredTasks.sort((a, b) => {
                const dateA = a.deadline ? new Date(a.deadline) : new Date(a.publication_date);
                const dateB = b.deadline ? new Date(b.deadline) : new Date(b.publication_date);
                return dateA - dateB;
            });

            setTasks(filteredTasks);
            setError(null);
        } catch (err) {
            setError('Błąd podczas filtrowania zadań');
            setTasks([]);
        } finally {
            setIsLoading(false);
        }
    }, [currentUser, calendarTasks]);

    const handleStatusChange = async (taskId, newStatus) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    status: newStatus,
                    userId: currentUser.id  // NOWE: dodajemy ID użytkownika który zmienia status
                }),
            });

            if (!response.ok) {
                throw new Error('Nie udało się zaktualizować statusu.');
            }

            // Po zmianie statusu odświeżamy calendarTasks
            // Dla zadań cyklicznych - po oznaczeniu jako zakończone pokaże się następne z serii
            await fetchCalendarTasks(currentUser.id);

        } catch (err) {
            console.error("Błąd podczas zmiany statusu:", err);
            alert("Wystąpił błąd podczas zmiany statusu zadania.");
        }
    };

    // ZMIANA: Kopiujemy funkcje do otwierania i zamykania modala
    const openModal = (content) => {
        if (content && content !== '<p></p>') {
            setSelectedTaskContent(content);
            setIsModalOpen(true);
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedTaskContent('');
    };


    if (isLoading) return <p>Ładowanie zadań...</p>;
    if (error) return <p style={{ color: 'red' }}>{error}</p>;

    return (
        <div className="all-tasks-container">
            <h2>Moje zadania</h2>
 
            <div className="table-responsive">
                <table className="table table-striped table-hover">
                    <thead>
                        <tr>
                            <th>Tytuł</th>
                            <th>Termin wykonania</th>
                            <th>Data utworzenia</th>
                            <th>Ważność</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.length > 0 ? tasks.map(task => (
                            // ZMIANA: Cały wiersz jest teraz klikalny
                            <tr 
                                key={task.id} 
                                className={`${task.importance === 'wysoka' || task.importance === 'ważne' ? 'importance-high' : ''} clickable-row`}
                                onClick={() => openModal(task.content_state)}
                            >
                                <td>
                                    {task.recurring_task_id && (
                                        <span style={{ marginRight: '8px', fontSize: '14px' }} title="Zadanie cykliczne - wyświetlane jest pierwsze niewykonane zadanie z serii">
                                            🔄
                                        </span>
                                    )}
                                    {task.title}
                                    {task.recurring_task_id && (
                                        <small style={{ display: 'block', color: '#666', fontSize: '0.8em', marginTop: '2px' }}>
                                            Zadanie cykliczne
                                        </small>
                                    )}
                                </td>
                                <td className={new Date(task.deadline) < new Date() && task.status !== 'zakończone' ? 'overdue-deadline' : ''}>
                                    {task.deadline ? new Date(task.deadline).toLocaleDateString('pl-PL') : 'Brak'}
                                </td>
                                <td>
                                    {new Date(task.publication_date).toLocaleDateString('pl-PL')}
                                </td>
                                <td>{task.importance}</td>
                                <td>
                                    {/* Zatrzymujemy propagację, aby zmiana statusu nie otwierała modala */}
                                    <select 
                                        value={task.status} 
                                        onChange={(e) => handleStatusChange(task.id, e.target.value)}
                                        onClick={(e) => e.stopPropagation()} 
                                        className="filter-select"
                                    >
                                        <option value="w toku">W toku</option>
                                        <option value="zakończone">Zakończone</option>
                                        <option value="draft">Szkic</option>
                                    </select>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="5">
                                    Brak zadań do wykonania. Świetnie! 🎉
                                    <br />

                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* ZMIANA: Renderujemy modal, jeśli isModalOpen jest true */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <button className="modal-close-btn" onClick={closeModal}>×</button>
                        <h3>Opis Zadania</h3>
                        <div 
                            className="task-description-content"
                            dangerouslySetInnerHTML={{ __html: selectedTaskContent }} 
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
