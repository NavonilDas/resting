requirejs.config({
    paths: {
        'jquery': 'jquery-2.2.4.min',
        'knockout': 'knockout-3.4.2',
        'knockout-secure-binding': 'knockout-secure-binding',
        'localforage': 'localforage.nopromises.min',
        'hjls': 'highlight.pack'
    }
});

requirejs(['jquery','storage','knockout','knockout-secure-binding','hjls','request','bookmark','bootstrap'], function($,storage,ko,ksb,hjls,request,bookmark,bootstrap) {
  
  function BookmarkViewModel(bookmark) {
    const self = this;
    this.id = bookmark.id;
    this.name = bookmark.name;
    this.isFolder = bookmark.isFolder;
    this.folder = bookmark.folder;
    this.requestMethod = bookmark.request ? bookmark.request.method : null;
    this.requestUrl = bookmark.request ? bookmark.request.url : null;
    this.bookmarks = bookmark.bookmarks ? bookmark.bookmarks.map( b => new BookmarkViewModel(b)) : undefined;
    
    this.request = bookmark.request;
    this.viewName = function() {
        return self.name && self.name.length > 0 ? self.name :  self.requestMethod +' ' + self.requestUrl;
    };
  }

  function AppViewModel() {
    const Resting = {
      responseContent : {},
      bookmarkCopy: null,   // copy of bookmark object to use in edit comparison TO IMPROVE !!!!
      bookmarkLoaded: null, // this is the id of bookmark..bookmarkLoadedIdx duplication ??
      bookmarkLoadedIdx: -1,
      requestMethod: ko.observable(),
      requestUrl: ko.observable(),
      responseBody: ko.observable(),
      callDuration: ko.observable(),
      callStatus: ko.observable(),
      responseHeaders: ko.observableArray(),
      requestHeaders: ko.observableArray(),
      showRequestHeaders: ko.observable(true),
      showRequestBody: ko.observable(false),
      showResponseHeaders: ko.observable(false),
      showResponseBody: ko.observable(true),
      useFormattedResponseBody: ko.observable(true),
      useRawResponseBody: ko.observable(false), // is it used ??
      bodyType: ko.observable(),
      formDataParams: ko.observableArray(),
      formEncodedParams: ko.observableArray(),
      rawBody: ko.observable(),
      bookmarks: ko.observableArray(),
      folders: ko.observableArray(),
      bookmarkName: ko.observable(),
      showBookmarkDialog: ko.observable(false),
      showFolderDialog: ko.observable(false),
      folderName: ko.observable(),
      folderSelected: ko.observable(),
      methods: ko.observableArray(['GET','POST','PUT','DELETE','HEAD','OPTIONS','CONNECT','TRACE','PATCH'])
    };

    const convertToFormData = (data = []) =>
      data.reduce((acc, record) => {
        acc[record.name] = record.value;
        return acc;
      }, {});

    const loadBookmarks = () =>
      storage.iterate(value => {
        const bookmarkObj = bookmark.fromJson(value);
          Resting.bookmarks.push(bookmarkObj); 
          if(bookmarkObj.isFolder) {
            Resting.folders.push(bookmarkObj);
          }
      });
      
    const loadBookmarksNewFormat = () =>
      storage.iterate( value => {
        Resting.bookmarks.push(new BookmarkViewModel(value)); 
        if(value.isFolder) {
          Resting.folders.push(value);
        }
      });

    const serializeBookmark = (bookmarkObj) => {
      return bookmark.fromJson(JSON.stringify(bookmarkObj));
    }
    
   
    const convertToUrlEncoded = (data = []) =>
      data.map( param => `${param.name}=${param.value}`).join('&');

    const updateBody = (bodyType, body) => {
      if (bodyType === 'form-data') {
        return Resting.formDataParams(body);
      }

      if (bodyType === 'x-www-form-urlencoded') {
        return Resting.formEncodedParams(body);
      }

      return Resting.rawBody(body);
    };

    const parseRequest = (req) => {
      Resting.requestMethod(req.method);
      Resting.requestUrl(req.url);
      Resting.bodyType(req.bodyType);
      Resting.requestHeaders(req.headers);
      updateBody(req.bodyType, req.body);
    };

    const dataToSend = () => {
      if (Resting.bodyType() === 'form-data') {
        return convertToFormData(Resting.formDataParams());
      }

      if (Resting.bodyType() === 'x-www-form-urlencoded') {
        return convertToUrlEncoded(Resting.formEncodedParams());
      }

      return Resting.rawBody().trim();
    };

  
    const loadBookmark = (bookmarkIdx) => {
      const selectedBookmark = Resting.bookmarks()[bookmarkIdx()];
      if (!selectedBookmark) return false;
      Resting.bookmarkCopy = bookmark.copyBookmark(selectedBookmark);
      Resting.bookmarkLoadedIdx = bookmarkIdx();
      Resting.folderSelected(selectedBookmark.folder);
      return loadBookmarkData(selectedBookmark);
    };
    
    // duplication..to improve putting two load function together
     const loadBookmarkObj = (bookmarkObj) => {
      Resting.bookmarkLoadedIdx = bookmarkObj.id;
      Resting.bookmarkCopy = bookmark.copyBookmark(bookmarkObj);
      Resting.folderSelected(bookmarkObj.folder);
      return loadBookmarkData(bookmarkObj);
    };
    
    const loadBookmarkData = (bookmark) => {
      Resting.bookmarkLoaded = bookmark.id;
      Resting.parseRequest(bookmark.request);
      Resting.bookmarkName(bookmark.name);
    };

    const body = (bodyType) => {
      if (bodyType === 'form-data') {
        return Resting.formDataParams();
      }

      if (bodyType === 'x-www-form-urlencoded') {
        return Resting.formEncodedParams();
      }

      return Resting.rawBody();
    };


    const validateBookmarkName = (name) => {
      if(name && name.trim().length > 0) {
        return name.trim();
      } else {
        return;
      }
    };

    const addFolder = () => {
      const folder = bookmark.makeFolder(new Date().toString(), Resting.folderName());
      storage.save(serializeBookmark(folder));
      Resting.bookmarks.push(new BookmarkViewModel(folder));
      Resting.folders.push(folder);
      Resting.folderName('');
      
      // close the dialog
      dismissFolderDialog();
    };

    const saveBookmark = () => {
      const req = request.makeRequest(
        Resting.requestMethod(), Resting.requestUrl(),
        Resting.requestHeaders(), Resting.bodyType(),
        body(Resting.bodyType()));
      const bookmarkId = Resting.bookmarkLoaded ? Resting.bookmarkLoaded : new Date().toString(); 
      const bookmarkObj = bookmark.makeBookmark(bookmarkId, req, validateBookmarkName(Resting.bookmarkName()), Resting.folderSelected());
      // if edit a bookmark
      if(Resting.bookmarkLoaded) {
        if(bookmarkObj.folder) {
          const oldFolder = Resting.bookmarkCopy.folder;
          if(oldFolder == bookmarkObj.folder) { // folderA to folderA
            let folderObj = Resting.bookmarks().find(b => b.id === bookmarkObj.folder);
            const modifiedFolder = bookmark.replaceBookmark(folderObj, new BookmarkViewModel(bookmarkObj)); 
            storage.save(serializeBookmark(modifiedFolder));
            Resting.bookmarks.replace(folderObj, modifiedFolder);
          } else if(!oldFolder) { //from no-folder to folderA
            const oldBookmark = Resting.bookmarks().find(b => b.id == bookmarkObj.id); // I need the ref to bookmark saved in observable array 
                                                                                      //  either it is not removed from it
            deleteBookmark(oldBookmark);
            let folderObj = Resting.bookmarks().find(b => b.id === bookmarkObj.folder);
            const modifiedFolder = bookmark.replaceBookmark(folderObj, new BookmarkViewModel(bookmarkObj)); 
            storage.save(serializeBookmark(modifiedFolder));
            Resting.bookmarks.replace(folderObj, modifiedFolder);
          } else if( oldFolder != bookmarkObj.folder) { // from folderA to folderB
            deleteBookmark(Resting.bookmarkCopy);
            let folderObj = Resting.bookmarks().find(b => b.id === bookmarkObj.folder);
            const modifiedFolder = bookmark.replaceBookmark(folderObj, new BookmarkViewModel(bookmarkObj)); 
            storage.save(serializeBookmark(modifiedFolder));
            Resting.bookmarks.replace(folderObj, modifiedFolder);
          }
        } else {  
          if(Resting.bookmarkCopy.folder) { // from folderA to no-folder
            deleteBookmark(Resting.bookmarkCopy);
            Resting.bookmarks.push(new BookmarkViewModel(bookmarkObj));
          } else { // from no-folder to no-folder 
            const oldBookmark = Resting.bookmarks().find(b => b.id === bookmarkObj.id);
            Resting.bookmarks.replace(oldBookmark, new BookmarkViewModel(bookmarkObj));
          }
          storage.save(serializeBookmark(bookmarkObj));
        }
      
        Resting.bookmarkCopy = null;   
        Resting.bookmarkLoaded = null;
        Resting.bookmarkLoadedIdx = -1;
        Resting.folderSelected('');
      } else { // if new bookmark
        if(bookmarkObj.folder) {
          let folderObj = Resting.bookmarks().find(b => b.id === bookmarkObj.folder);
          const modifiedFolder = bookmark.addBookmarks(folderObj, new BookmarkViewModel(bookmarkObj));
          storage.save(serializeBookmark(modifiedFolder));
          Resting.bookmarks.replace(folderObj, modifiedFolder);
        } else {
           storage.save(serializeBookmark(bookmarkObj));
           Resting.bookmarks.push(new BookmarkViewModel(bookmarkObj));
        }
      }
      
      // close the dialog
      dismissSaveBookmarkDialog();
    };

    const deleteBookmark = bookmark => {
      if(bookmark.folder) {
        const containerFolder = Resting.bookmarks().find( b => b.id === bookmark.folder);
        let modifiedFolder = Object.assign({},containerFolder);
        modifiedFolder.bookmarks = containerFolder.bookmarks.filter(b => b.id !== bookmark.id);
        storage.save(serializeBookmark(modifiedFolder));
        Resting.bookmarks.replace(containerFolder,modifiedFolder);
      } else {
        storage.deleteById(bookmark.id, () => Resting.bookmarks.remove(bookmark));
        }
      };

    const convertToHeaderObj = headersList =>
      headersList.reduce((acc, header) => {
        acc[header.name] = header.value;
        return acc;
      }, {});


    const displayResponse = (response) => {
      Resting.callDuration(`${response.duration}ms`);
      Resting.callStatus(response.status);
      response.headers.forEach(header => Resting.responseHeaders.push(header));
      Resting.responseContent = response.content;
      if(Resting.useFormattedResponseBody()) {
        Resting.responseBody(JSON.stringify(response.content,null,2));
        highlight();
      } else {
        Resting.responseBody(JSON.stringify(response.content));
      }
    };

    const send = () => {
      request.execute(Resting.requestMethod(),Resting.requestUrl(),convertToHeaderObj(Resting.requestHeaders()),Resting.bodyType(),Resting.dataToSend(),displayResponse);
    };

    const requestHeadersPanel = () => {
      Resting.showRequestHeaders(true);
      Resting.showRequestBody(false);
    };

    const requestBodyPanel = () => {
      Resting.showRequestHeaders(false);
      Resting.showRequestBody(true);
    };

    const responseHeadersPanel = () => {
      Resting.showResponseHeaders(true);
      Resting.showResponseBody(false);

      // close jquery accordion
      $('#collapseOne').collapse('hide');
    };

    const responseBodyPanel = () => {
      Resting.showResponseBody(true);
      Resting.showResponseHeaders(false);
    };

    const formattedResponseBody = () => {
      Resting.useFormattedResponseBody(true);
      Resting.useRawResponseBody(false);
      Resting.responseBody(JSON.stringify(Resting.responseContent,null,2));
      highlight();
    };

    const rawResponseBody = () => {
      Resting.useFormattedResponseBody(false);
      Resting.useRawResponseBody(true);
      Resting.responseBody(JSON.stringify(Resting.responseContent));
      unhighlight();
    };
    
    const saveBookmarkDialog = () => {
      Resting.showBookmarkDialog(true);
    };
    
    const folderDialog = () => {
      Resting.showFolderDialog(true);
    };
    
    const dismissSaveBookmarkDialog = () => {
      Resting.showBookmarkDialog(false);
      Resting.bookmarkName('');
    };
    
    const dismissFolderDialog = () => {
      Resting.showFolderDialog(false);
    };
    
    
    const unhighlight = () => {
      $('#highlighted-response').removeClass('hljs');
    };
    
    const highlight = () => {
      $('#highlighted-response').each(function(i, block) {
      hljs.highlightBlock(block);
      });
    };
    
    const callSendOnEnter = (data, event) => {
      const enter = 13;
      if(event.keyCode === enter) {
        send();
      }
    };
    
    
    
    // define the storage format conversion
    // this function converts format of bookmarks to the new version
    // consider to maintain the call until version <= 0.6.0 of web-extentsion for compatibility goal
    (() => {
      storage.iterate( value => {
        try {
         const bookmarkObj = bookmark.fromJson(value);
         storage.save(bookmarkObj);
        } catch(e) {
          console.log('bookmark/folder already converted in new format');
        }
      }, (err,success) => {
        if(!err) {
          loadBookmarksNewFormat();
        }
      });
    })();
    
    Resting.parseRequest = parseRequest;
    Resting.dataToSend = dataToSend;
    Resting.send = send;
    Resting.saveBookmark = saveBookmark;
    Resting.loadBookmark = loadBookmark;
    Resting.loadBookmarkObj = loadBookmarkObj;
    Resting.deleteBookmark = deleteBookmark;
    Resting.requestBodyPanel = requestBodyPanel;
    Resting.responseBodyPanel = responseBodyPanel;
    Resting.formattedResponseBody = formattedResponseBody;
    Resting.requestHeadersPanel = requestHeadersPanel;
    Resting.responseHeadersPanel = responseHeadersPanel;
    Resting.rawResponseBody = rawResponseBody;
    Resting.saveBookmarkDialog = saveBookmarkDialog;
    Resting.dismissSaveBookmarkDialog = dismissSaveBookmarkDialog;
    Resting.folderDialog = folderDialog;
    Resting.dismissFolderDialog = dismissFolderDialog;
    Resting.addFolder = addFolder;
    Resting.callSendOnEnter = callSendOnEnter;

    return Resting;
  }

  // init application
  $(() => {
    const screenWidth = screen.width;
    const dialogLeftPosition = screenWidth / 2  - 200;
    $('div.dialog').css('left', dialogLeftPosition+'px');

    // seems that this below must be the last instructions to permit component to be registered
    ko.components.register('entry-list', {
      viewModel: { require: 'components/entry-list/component' },
      template: { require: 'text!components/entry-list/view.html' }
    });

    ko.components.register('request-body', {
      viewModel: { require: 'components/request-body/component' },
      template: { require: 'text!components/request-body/template.html' }
    });

    
      // Show all options, more restricted setup than the Knockout regular binding.
   var options = {
     attribute: "data-bind",        // default "data-sbind"
     globals: window,               // default {}
     bindings: ko.bindingHandlers,  // default ko.bindingHandlers
     noVirtualElements: false       // default true
   };

   ko.bindingProvider.instance = new ksb(options);
   
   ko.applyBindings(new AppViewModel());
  });
});
