package com.aws.blocks.example

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.aws.blocks.example.screens.AuthScreen
import com.aws.blocks.example.screens.FileScreen
import com.aws.blocks.example.screens.KvStoreScreen
import com.aws.blocks.example.screens.RealtimeScreen
import com.aws.blocks.example.screens.TodoScreen
import com.aws.blocks.example.theme.AppTheme
import blocks.testapp.Api
import blocks.testapp.AuthApi

@Composable
fun App() {
    val auth = remember { AuthApi() }
    val api = remember { Api() }
    var selectedTab by remember { mutableStateOf(Tab.Auth) }

    AppTheme {
        Scaffold(
            bottomBar = {
                NavigationBar {
                    Tab.entries.forEach { tab ->
                        NavigationBarItem(
                            selected = selectedTab == tab,
                            onClick = { selectedTab = tab },
                            label = { Text(tab.label) },
                            icon = {}
                        )
                    }
                }
            }
        ) { innerPadding ->
            val modifier = Modifier.padding(innerPadding)
            when (selectedTab) {
                Tab.Auth -> AuthScreen(auth, modifier)
                Tab.Todos -> TodoScreen(api, modifier)
                Tab.KvStore -> KvStoreScreen(api, modifier)
                Tab.Realtime -> RealtimeScreen(api, modifier)
                Tab.Files -> FileScreen(api, modifier)
            }
        }
    }
}
