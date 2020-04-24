import {useEffect, useRef} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import flask from 'flask-urls.macro';
import {userLogout, userLogin, loginWindowOpened, loginWindowClosed} from './actions';
import {getToken, getLoginWindowId, isLoggedIn, isAcquiringToken} from './selectors';

export function useAuthentication() {
  const popup = useRef(null);
  const popupId = useRef(null);
  const loginWindowId = useSelector(getLoginWindowId);
  const isUserLoggedIn = useSelector(isLoggedIn);
  const acquiringToken = useSelector(isAcquiringToken);
  const dispatch = useDispatch();

  const login = () => {
    const width = window.outerWidth * 0.5;
    const height = window.outerHeight * 0.7;
    if (popup.current) {
      popup.current.close();
    }
    popupId.current = Date.now();
    dispatch(loginWindowOpened(popupId.current));
    popup.current = window.open(
      flask`auth.login`(),
      'login',
      `menubar=no,toolbar=no,location=no,dependent=yes,width=${width},height=${height}`
    );
  };

  const logout = () => {
    dispatch(userLogout());
  };

  useEffect(() => {
    const handleMessage = evt => {
      if (evt.source !== popup.current) {
        // ignore the message if it wasn't from our popup. this happens e.g. when this
        // hook is used in multiple places atthe same time.
        return;
      }
      if (evt.origin !== window.location.origin) {
        // we should never get messages from different origins, so those are ignored too
        console.error(
          `Unexpected message origin: expected ${window.location.origin}, got ${evt.origin}`
        );
        return;
      }
      if (evt.data.error) {
        console.warn(`Login failed: ${evt.data.error}`);
        return;
      }
      if (evt.data.token) {
        dispatch(userLogin(evt.data.token));
      }
    };

    const closePopup = () => {
      popupId.current = null;
      if (popup.current) {
        popup.current.close();
        popup.current = null;
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('unload', closePopup);

    return () => {
      window.removeEventListener('unload', closePopup);
      window.removeEventListener('message', handleMessage);
      closePopup();
    };
  }, [dispatch]);

  useEffect(() => {
    if (isUserLoggedIn && !acquiringToken) {
      return;
    }
    const interval = window.setInterval(() => {
      if (
        popupId.current !== null &&
        loginWindowId === popupId.current &&
        (!popup.current || popup.current.closed)
      ) {
        dispatch(loginWindowClosed());
      }
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [dispatch, loginWindowId, isUserLoggedIn, acquiringToken]);

  return {login, logout};
}

export function checkInitialToken(store) {
  const token = localStorage.getItem('token');
  if (token) {
    console.log('Found initial token in local storage');
    store.dispatch(userLogin(token));
  }
}

export function subscribeTokenChanges(store) {
  store.subscribe(() => {
    const token = getToken(store.getState());
    if (localStorage.getItem('token') === token) {
      return;
    }
    if (token) {
      console.log('Saving token in local storage');
      localStorage.setItem('token', token);
    } else {
      console.log('Removing token from local storage');
      localStorage.removeItem('token');
    }
  });
}
