import pytest
import networkx as nx
from shapely.geometry import LineString


@pytest.fixture
def test_client():
    """
    Test client for hitting FastAPI endpoints directly.

    app.main is imported lazily, inside the fixture, because importing it
    runs Base.metadata.create_all() against a live database. A module-level
    import here would make every test in the suite -- including the pure
    routing tests -- require a running Postgres.
    """
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


def _add_street(G, u, v, *, id, length_m, dark_fraction, observation_state,
                geometry=None):
    """
    Add one undirected street as a pair of directed edges.

    Mirrors graph_builder.build_graph_from_db: the database holds one row
    per physical street, and walking is bidirectional, so both traversal
    directions share the same attributes and geometry.
    """
    attrs = dict(
        id=id,
        length_m=length_m,
        dark_fraction=dark_fraction,
        longest_gap_m=(dark_fraction or 0.0) * length_m,
        observation_state=observation_state,
        geometry=geometry,
    )
    G.add_edge(u, v, **attrs)
    G.add_edge(v, u, **attrs)


@pytest.fixture
def mock_graph():
    """
    Two routes between the same endpoints:

        A ----------- direct, 100 m, 90% dark ------------ D
        |                                                  |
        +--- B, 60 m, lit ---+--- C, 60 m, lit ------------+

    The direct road is shorter but almost entirely unlit. The detour is
    120 m (20% longer) and fully lit, so any alpha above 1.20 should let
    the lambda sweep prefer it.
    """
    G = nx.MultiDiGraph()

    A = (0.0, 0.0)
    MID = (0.0, 1.0)
    D = (1.0, 1.0)

    _add_street(G, A, D, id=1, length_m=100.0,
                dark_fraction=0.9, observation_state="predicted")

    _add_street(G, A, MID, id=2, length_m=60.0,
                dark_fraction=0.0, observation_state="predicted")

    _add_street(G, MID, D, id=3, length_m=60.0,
                dark_fraction=0.0, observation_state="predicted")

    return G


@pytest.fixture
def unknown_graph():
    """
    Same shape as mock_graph, but the detour has no lighting evidence.

    Used to check that unobserved segments are never scored as dark, and
    that unknown_policy changes which route wins.
    """
    G = nx.MultiDiGraph()

    A = (0.0, 0.0)
    MID = (0.0, 1.0)
    D = (1.0, 1.0)

    _add_street(G, A, D, id=1, length_m=100.0,
                dark_fraction=0.9, observation_state="predicted")

    _add_street(G, A, MID, id=2, length_m=60.0,
                dark_fraction=None, observation_state="unobserved")

    _add_street(G, MID, D, id=3, length_m=60.0,
                dark_fraction=None, observation_state="unobserved")

    return G


@pytest.fixture
def curved_graph():
    """
    A -> B -> C where the middle street curves and is stored C->B, i.e.
    against the direction it gets traversed. Exercises the orientation
    flip in _path_geometry.
    """
    G = nx.MultiDiGraph()

    A = (77.2120, 28.6120)
    B = (77.2120, 28.6135)
    C = (77.2125, 28.6150)

    _add_street(G, A, B, id=1, length_m=160.0,
                dark_fraction=0.0, observation_state="predicted",
                geometry=LineString([A, B]))

    # Stored C -> B, with an interior vertex.
    _add_street(G, B, C, id=2, length_m=180.0,
                dark_fraction=0.0, observation_state="predicted",
                geometry=LineString([C, (77.2128, 28.6142), B]))

    return G