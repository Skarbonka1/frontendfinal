import React, { useState, useEffect, useMemo } from 'react';

const StatusBadge = ({ status }) => {
    const statusClassMap = {
        'w toku': 'status-w-toku',
        'draft': 'status-draft',
        'zakończone': 'status-zakończone',
        'po terminie': 'status-po-terminie'
    };
    const badgeClass = statusClassMap[status] || 'status-default';
    return (
        <span className={`status-badge ${badgeClass}`}>
            {status}
        </span>
    );
};

export default function AllTasksView() {
    const [tasks, setTasks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const [filters, setFilters] = useState({
        searchText: '',
        status: 'all',
        importance: 'all'
    });

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTaskContent, setSelectedTaskContent] = useState('');

    const API_BASE_URL = 'https://serwerfinal.onrender.com';

    const fetchAllTasks = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/tasks/all`);
            if (!response.ok) {
                throw new Error('Odpowiedź sieci nie była poprawna.');
            }
            const data = await response.json();
            setTasks(data);
            setError(null);
        } catch (error) {
            console.error("Błąd podczas pobierania wszystkich zadań:", error);
            setError("Nie udało się załadować zadań. Spróbuj ponownie później.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAllTasks();
    }, []);

    const handleDeleteTask = async (taskId, taskTitle) => {
        const isConfirmed = window.confirm(
            `Czy na pewno chcesz usunąć zadanie "${taskTitle}"?\n\nTa operacja jest nieodwracalna!`
        );
        
        if (!isConfirmed) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error('Nie udało się usunąć zadania.');
            }

            // Odświeżamy listę zadań po usunięciu
            await fetchAllTasks();
            
        } catch (error) {
            console.error("Błąd podczas usuwania zadania:", error);
            alert("Nie udało się usunąć zadania. Spróbuj ponownie później.");
        }
    };
    
    const getImportanceClass = (importance) => {
        if (!importance) return '';
        const importanceLower = importance.toLowerCase();
        if (importanceLower === 'wysoka' || importanceLower === 'ważne') return 'importance-high';
        if (importanceLower === 'niska') return 'importance-low';
        return '';
    };

    const isOverdue = (task) => {
        if (!task.deadline || task.status === 'zakończone') return false;
        const deadlineDate = new Date(task.deadline);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return deadlineDate < today;
    };

    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            const searchTextLower = filters.searchText.toLowerCase();
            const searchableContent = [
                task.title,
                task.status,
                task.creatorName,
                task.assignedUsers?.join(' '),
                task.importance,
                task.deadline ? new Date(task.deadline).toLocaleDateString('pl-PL') : '',
                new Date(task.publication_date).toLocaleString('pl-PL')
            ].join(' ').toLowerCase();
            const matchesSearchText = searchTextLower === '' || searchableContent.includes(searchTextLower);
            let matchesStatus;
            if (filters.status === 'po terminie') {
                matchesStatus = isOverdue(task);
            } else {
                matchesStatus = filters.status === 'all' || task.status === filters.status;
            }
            const matchesImportance = filters.importance === 'all' || (task.importance && task.importance.toLowerCase() === filters.importance);
            return matchesSearchText && matchesStatus && matchesImportance;
        });
    }, [tasks, filters]);

    if (isLoading) {
        return <p>Ładowanie wszystkich zadań...</p>;
    }

    if (error) {
        return <p style={{ color: 'red' }}>{error}</p>;
    }
    
    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prevFilters => ({
            ...prevFilters,
            [name]: value
        }));
    };
    
    const openModal = (content) => {
        // Otwieraj modal tylko jeśli jest jakaś treść do pokazania
        if (content && content !== '<p></p>') {
            setSelectedTaskContent(content);
            setIsModalOpen(true);
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedTaskContent('');
    };


    return (
        <div className="all-tasks-container">
            <h2>Wszystkie Zadania w Systemie</h2>
            
            <div className="filters-container">
                <input
                    type="text"
                    name="searchText"
                    placeholder="Szukaj (jak CTRL+F)..."
                    value={filters.searchText}
                    onChange={handleFilterChange}
                    className="filter-input"
                />
                <select name="status" value={filters.status} onChange={handleFilterChange} className="filter-select">
                    <option value="all">Wszystkie statusy</option>
                    <option value="w toku">W toku</option>
                    <option value="draft">Szkic</option>
                    <option value="zakończone">Zakończone</option>
                    <option value="po terminie">Po terminie</option>
                </select>
                <select name="importance" value={filters.importance} onChange={handleFilterChange} className="filter-select">
                    <option value="all">Wszystkie ważności</option>
                    <option value="wysoka">Wysoka</option>
                    <option value="normalna">Normalna</option>
                    <option value="niska">Niska</option>
                </select>
            </div>

            <div className="table-responsive">
                <table className="table table-striped table-hover">
                    <thead>
                        <tr>
                            <th>Tytuł</th>
                            <th>Status</th>
                            {/* ZMIANA: Usunęliśmy kolumnę "Opis" */}
                            <th>Twórca</th>
                            <th>Przypisani</th>
                            <th>Termin</th>
                            <th>Ważność</th>
                            <th>Data publikacji</th>
                            <th>Akcje</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTasks.length > 0 ? filteredTasks.map(task => (
                            // ZMIANA: Cały wiersz jest teraz klikalny
                            <tr 
                                key={task.id} 
                                className={`${getImportanceClass(task.importance)} clickable-row`}
                                onClick={() => openModal(task.content_state)}
                            >
                                <td>
                                    {task.recurring_task_id && (
                                        <span style={{ marginRight: '5px', fontSize: '14px' }} title="Zadanie cykliczne">
                                            🔄
                                        </span>
                                    )}
                                    {task.title}
                                </td>
                                <td><StatusBadge status={task.status} /></td>
                                {/* ZMIANA: Usunęliśmy komórkę z ikonką oka */}
                                <td>{task.creatorName}</td>
                                <td>{task.assignedUsers?.join(', ') || 'Brak'}</td>
                                <td className={isOverdue(task) ? 'overdue-deadline' : ''}>
                                    {task.deadline ? new Date(task.deadline).toLocaleDateString('pl-PL') : 'Brak'}
                                </td>
                                <td>{task.importance}</td>
                                <td>{new Date(task.publication_date).toLocaleString('pl-PL')}</td>
                                <td>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation(); // Zapobiega otwieraniu modala
                                            handleDeleteTask(task.id, task.title);
                                        }}
                                        className="btn btn-danger btn-sm"
                                        title="Usuń zadanie"
                                    >
                                        🗑️
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                {/* ZMIANA: Zwiększamy colSpan z 7 na 8 (dodaliśmy kolumnę "Akcje") */}
                                <td colSpan="8">
                                    {tasks.length === 0 
                                        ? "Nie znaleziono żadnych zadań w systemie."
                                        : "Brak zadań pasujących do kryteriów wyszukiwania."
                                    }
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

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
